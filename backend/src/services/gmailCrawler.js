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
        // Scarica metadata leggero per ottenere internetMessageId
        const metaRes = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=metadata&metadataHeaders=Message-Id`,
          token
        );
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();
        const msgIdHeader = meta.payload?.headers?.find(h => h.name === 'Message-Id' || h.name === 'Message-ID');
        const msgId = msgIdHeader?.value || gmailId;

        if (knownIds.has(msgId)) continue;
        pageAllKnown = false;

        // Raw RFC822 (base64url)
        const rawRes = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=raw`, token
        );
        if (!rawRes.ok) { console.error(`[GmailCrawler] raw ${gmailId}: ${rawRes.status}`); continue; }
        const rawData = await rawRes.json();
        if (!rawData.raw) continue;

        const rawBuffer = Buffer.from(rawData.raw, 'base64');
        const rawGzipped = await gzip(rawBuffer);
        const rawEncrypted = encryptBuffer(rawGzipped);

        const uid = stableUid(msgId);
        const internalDate = rawData.internalDate ? new Date(parseInt(rawData.internalDate)) : new Date();

        // Estrai mittente e destinatari dagli header
        const headers = meta.payload?.headers || [];
        const getH = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || null;
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
          await db.query(
            `INSERT INTO archived_emails
             (mailbox_id, uid, message_id, subject, sender_name, sender_email,
              recipients, cc, bcc, sent_at, path, has_attachments,
              raw, size_bytes, compressed_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
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
          knownIds.add(msgId);
          synced++;
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

module.exports = { syncMailbox };