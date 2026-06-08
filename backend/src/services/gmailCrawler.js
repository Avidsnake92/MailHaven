const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const { encryptBuffer, decrypt, encrypt } = require('./crypto');

const stableUid = (msgId) => {
  const h = crypto.createHash('sha256').update(msgId).digest();
  return h.readUInt32BE(0);
};

// Refresh token Google
const refreshGoogleToken = async (db, mailbox) => {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: (()=>{try{return decrypt(mailbox.oauth_refresh_token)||mailbox.oauth_refresh_token}catch{return mailbox.oauth_refresh_token}})(),
      grant_type:    'refresh_token',
    })
  });
  const tokens = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db.query(
    'UPDATE mailboxes SET oauth_access_token=$1, oauth_expires_at=$2 WHERE id=$3',
    [encrypt(tokens.access_token), expiresAt, mailbox.id]
  );
  return tokens.access_token;
};

const getValidToken = async (db, mailbox) => {
  if (mailbox.oauth_expires_at && new Date(mailbox.oauth_expires_at) > new Date(Date.now() + 60000)) {
    try{return decrypt(mailbox.oauth_access_token)||mailbox.oauth_access_token}catch{return mailbox.oauth_access_token}
  }
  return refreshGoogleToken(db, mailbox);
};

const gmailFetch = async (url, token, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '5') * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error('Gmail API: troppi tentativi falliti');
};

// Mappa label Gmail a nomi cartella
const LABEL_MAP = {
  INBOX: 'INBOX', SENT: 'Sent', IMPORTANT: 'Important',
  STARRED: 'Starred', SPAM: null, TRASH: null, DRAFT: null,
};

const syncMailbox = async (mailbox, db) => {
  console.log(`[GmailCrawler] Sync Gmail API: ${mailbox.email}`);
  const token = await getValidToken(db, mailbox);
  if (!token) throw new Error('Token OAuth Google non disponibile');

  // Lista label
  const labelsRes = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', token);
  if (!labelsRes.ok) throw new Error(`Gmail labels: ${labelsRes.status}`);
  const labelsData = await labelsRes.json();
  const labels = (labelsData.labels || []).filter(l => {
    if (l.type === 'system') {
      return LABEL_MAP[l.id] !== null && LABEL_MAP[l.id] !== undefined;
    }
    return true; // label utente — includi
  });

  // Message ID già noti
  const existingR = await db.query(
    'SELECT message_id FROM archived_emails WHERE mailbox_id=$1 AND message_id IS NOT NULL',
    [mailbox.id]
  );
  const knownIds = new Set(existingR.rows.map(r => r.message_id));

  let totalSynced = 0;
  const folderResults = [];

  for (const label of labels) {
    const folderPath = LABEL_MAP[label.id] || label.name || label.id;
    let synced = 0;

    let pageToken = null;
    let allKnown = false;

    while (!allKnown) {
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${label.id}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`;
      const listRes = await gmailFetch(listUrl, token);
      if (!listRes.ok) { console.error(`[GmailCrawler] ${folderPath}: ${listRes.status}`); break; }
      const listData = await listRes.json();
      const messages = listData.messages || [];

      if (messages.length === 0) break;

      let pageAllKnown = true;
      for (const { id: gmailId } of messages) {
        // Ottimizzazione: fetch raw unica che include headers + contenuto
        const rawRes = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=raw`, token
        );
        if (!rawRes.ok) { console.error(`[GmailCrawler] raw ${gmailId}: ${rawRes.status}`); continue; }
        const rawData = await rawRes.json();
        if (!rawData.raw) continue;

        const rawBuffer = Buffer.from(rawData.raw, 'base64url');
        // Estrai Message-ID dagli snippet headers inline
        const meta = rawData;
        const msgIdMatch = rawData.raw ? Buffer.from(rawData.raw,'base64url').toString('utf8',0,2000).match(/Message-ID:\s*([^
]+)/i) : null;
        const msgId = msgIdMatch ? msgIdMatch[1].trim() : gmailId;
        const rawGzipped = await gzip(rawBuffer);
        const rawEncrypted = encryptBuffer(rawGzipped);

        const uid = stableUid(msgId);
        const internalDate = rawData.internalDate ? new Date(parseInt(rawData.internalDate)) : new Date();

        // Estrai mittente e destinatari dagli header
        // Estrai headers dal raw RFC822 (piu affidabile di meta.payload dopo ottimizzazione)
        const rawStr = rawBuffer.toString('utf8', 0, Math.min(rawBuffer.length, 4000));
        const getHeader = (name) => {
          const re = new RegExp('^' + name + ':\\s*(.+?)\\r?$', 'mi');
          const m = rawStr.match(re);
          return m ? m[1].trim() : null;
        };
        const headers = [];
        const getH = (name) => getHeader(name);
        const parseAddr = (str) => {
          if (!str) return [];
          return str.split(',').map(a => {
            const m = a.trim().match(/^"?(.+?)"?\s*<?([^>]+@[^>]+)>?$/);
            return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: a.trim() };
          });
        };

        const fromRaw = getH('From');
        const fromMatch = fromRaw?.match(/^"?(.+?)"?\s*<?([^>]+@[^>]+)>?$/);
        const senderName  = fromMatch ? fromMatch[1].trim() : null;
        const senderEmail = fromMatch ? fromMatch[2].trim() : fromRaw;

        try {
          const insertResult = await db.query(
            `INSERT INTO archived_emails
             (mailbox_id, uid, message_id, subject, sender_name, sender_email,
              recipients, cc, bcc, sent_at, path, has_attachments,
              raw, size_bytes, compressed_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (mailbox_id, uid, path) DO NOTHING
             RETURNING id`,
            [mailbox.id, uid, msgId,
             getH('Subject') || '(senza oggetto)',
             senderName, senderEmail,
             JSON.stringify(parseAddr(getH('To'))),
             JSON.stringify(parseAddr(getH('Cc'))),
             JSON.stringify(parseAddr(getH('Bcc'))),
             internalDate, folderPath,
             (meta.payload?.parts?.length > 0) || false,
             rawEncrypted, rawBuffer.length, rawGzipped.length]
          );
          if (insertResult.rows.length > 0) {
            knownIds.add(msgId);
            synced++;
            pageAllKnown = false; // nuovo messaggio trovato, continua paginazione
          }
        } catch (e) {
          if (!e.message.includes('unique')) console.error(`[GmailCrawler] save:`, e.message);
        }
      }

      allKnown = pageAllKnown;
      pageToken = listData.nextPageToken || null;
      if (!pageToken) break;
    }

    if (synced > 0) console.log(`[GmailCrawler] ${mailbox.email} — ${folderPath}: +${synced}`);
    totalSynced += synced;
    folderResults.push({ folder: folderPath, synced });
  }

  console.log(`[GmailCrawler] ${mailbox.email}: totale +${totalSynced}`);
  return { total: totalSynced, folders: folderResults };
};


// Elimina messaggi Gmail per RFC822 Message-ID
const deleteMessages = async (db, mailbox, messageIds) => {
  if (!messageIds.length) return 0;
  const token = await getValidToken(db, mailbox);
  let deleted = 0;
  for (const msgId of messageIds) {
    try {
      const searchRes = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=rfc822msgid:${encodeURIComponent(msgId)}&maxResults=1`,
        token
      );
      if (!searchRes.ok) continue;
      const data = await searchRes.json();
      const gmailId = data.messages?.[0]?.id;
      if (!gmailId) continue;
      const delRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}/trash`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (delRes.ok) deleted++;
    } catch(e) { console.error('[GmailCrawler] delete error:', e.message); }
  }
  return deleted;
};

// Carica un EML su Gmail via API
const uploadMessage = async (db, mailbox, emlBuffer, labelName) => {
  const token = await getValidToken(db, mailbox);
  const LABEL_IDS = { 'INBOX': 'INBOX', 'Sent': 'SENT', 'inbox': 'INBOX' };
  const labelId = LABEL_IDS[labelName] || 'INBOX';
  const raw = emlBuffer.toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?uploadType=media', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'message/rfc822',
    },
    body: emlBuffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail upload: ${res.status} ${err}`);
  }
  return true;
};

module.exports = { syncMailbox, deleteMessages, uploadMessage };
