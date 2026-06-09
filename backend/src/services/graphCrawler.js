const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const { encryptBuffer } = require('./crypto');
const { getValidToken } = require('./oauthHelper');

// UID stabile da message_id (evita collisioni con hash CRC32-like)
const stableUid = (msgId) => {
  const h = crypto.createHash('sha256').update(msgId).digest();
  return h.readInt32BE(0); // INT32 firmato: compatibile con PostgreSQL INTEGER
};

const graphFetch = async (url, token, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (res.status === 429 || res.status === 503) {
      const wait = parseInt(res.headers.get('Retry-After') || '5') * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error('Graph API: troppi tentativi falliti');
};

const listFolders = async (token, parentId = null, parentPath = '') => {
  const folders = [];
  let url = parentId
    ? `https://graph.microsoft.com/v1.0/me/mailFolders/${parentId}/childFolders?$top=100&includeHiddenFolders=true`
    : `https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&includeHiddenFolders=true`;
  while (url) {
    const res = await graphFetch(url, token);
    if (!res.ok) {
      console.error(`[GraphCrawler] listFolders error: ${res.status}`);
      break;
    }
    const data = await res.json();
    for (const folder of (data.value || [])) {
      const folderPath = parentPath ? `${parentPath}/${folder.displayName}` : folder.displayName;
      folders.push({ ...folder, _path: folderPath });
      // Ricorsione su sotto-cartelle
      if ((folder.childFolderCount || 0) > 0) {
        try {
          const children = await listFolders(token, folder.id, folderPath);
          folders.push(...children);
        } catch(e) {
          console.error(`[GraphCrawler] childFolders error for ${folderPath}:`, e.message);
        }
      }
    }
    url = data['@odata.nextLink'] || null;
  }
  return folders;
};

const EXCLUDED_WELL_KNOWN = ['drafts', 'junkemail', 'deleteditems', 'outbox'];

const syncMailbox = async (mailbox, db) => {
  console.log(`[GraphCrawler] Sync Graph API: ${mailbox.email}`);
  const token = await getValidToken(db, mailbox);
  if (!token) throw new Error('Token OAuth Microsoft non disponibile');

  const folders = await listFolders(token);
  let totalSynced = 0;
  const folderResults = [];

  for (const folder of folders) {
    if (EXCLUDED_WELL_KNOWN.includes(folder.wellKnownName)) {
      folderResults.push({ folder: folder.displayName, skipped: true });
      continue;
    }

    const folderPath = folder._path || folder.displayName;

    // Message ID già noti per questo mailbox
    const existingR = await db.query(
      'SELECT message_id FROM archived_emails WHERE mailbox_id=$1 AND message_id IS NOT NULL',
      [mailbox.id]
    );
    const knownIds = new Set(existingR.rows.map(r => r.message_id));

    let synced = 0;
    let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/messages` +
              `?$top=50&$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,` +
              `bccRecipients,receivedDateTime,hasAttachments&$orderby=receivedDateTime desc`;

    while (url) {
      const res = await graphFetch(url, token);
      if (!res.ok) { console.error(`[GraphCrawler] ${folderPath}: ${res.status}`); break; }
      const data = await res.json();
      const messages = data.value || [];

      let allKnown = true;
      for (const msg of messages) {
        const msgId = msg.internetMessageId || msg.id;
        if (knownIds.has(msgId)) continue;
        allKnown = false;

        // Raw RFC822
        const rawRes = await graphFetch(
          `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/$value`, token
        );
        if (!rawRes.ok) { console.error(`[GraphCrawler] raw ${msg.id}: ${rawRes.status}`); continue; }

        const rawBuffer = Buffer.from(await rawRes.arrayBuffer());
        const rawGzipped = await gzip(rawBuffer);
        const rawEncrypted = encryptBuffer(rawGzipped);

        const uid = stableUid(msgId);
        const senderEmail = msg.from?.emailAddress?.address || null;
        const senderName  = msg.from?.emailAddress?.name   || null;
        const toR  = (msg.toRecipients  || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const ccR  = (msg.ccRecipients  || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const bccR = (msg.bccRecipients || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const sentAt = msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date();

        try {
          await db.query(
            `INSERT INTO archived_emails
             (mailbox_id, uid, message_id, subject, sender_name, sender_email,
              recipients, cc, bcc, sent_at, path, has_attachments,
              raw, size_bytes, compressed_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
            [mailbox.id, uid, msgId, msg.subject || '(senza oggetto)',
             senderName, senderEmail,
             JSON.stringify(toR), JSON.stringify(ccR), JSON.stringify(bccR),
             sentAt, folderPath, msg.hasAttachments || false,
             rawEncrypted, rawBuffer.length, rawGzipped.length]
          );
          knownIds.add(msgId);
          synced++;
        } catch (e) {
          if (!e.message.includes('unique')) console.error(`[GraphCrawler] save:`, e.message);
        }
      }

      // Se tutti i messaggi della pagina sono già noti, non serve scaricare le pagine successive
      if (allKnown && messages.length > 0) break;
      url = data['@odata.nextLink'] || null;
    }

    if (synced > 0) console.log(`[GraphCrawler] ${mailbox.email} — ${folderPath}: +${synced}`);
    totalSynced += synced;
    folderResults.push({ folder: folderPath, synced });
  }

  console.log(`[GraphCrawler] ${mailbox.email}: totale +${totalSynced}`);
  return { total: totalSynced, folders: folderResults };
};


// Cerca messaggi Graph per RFC822 Message-ID e li elimina
const deleteMessages = async (db, mailbox, messageIds) => {
  if (!messageIds.length) return 0;
  const { getValidToken } = require('./oauthHelper');
  const { decrypt } = require('./crypto');
  let token;
  try {
    const mb = { ...mailbox, oauth_access_token: mailbox.oauth_access_token };
    token = await getValidToken(db, mb);
  } catch(e) { console.error('[GraphCrawler] deleteMessages token error:', e.message); return 0; }

  let deleted = 0;
  for (const msgId of messageIds) {
    try {
      // Cerca per internetMessageId
      const searchRes = await graphFetch(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=internetMessageId eq '${encodeURIComponent(msgId)}'&$select=id&$top=1`,
        token
      );
      if (!searchRes.ok) continue;
      const data = await searchRes.json();
      const graphId = data.value?.[0]?.id;
      if (!graphId) continue;
      // Elimina
      const delRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${graphId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (delRes.status === 204) deleted++;
    } catch(e) { console.error('[GraphCrawler] delete error:', e.message); }
  }
  return deleted;
};

// Carica un EML su Microsoft 365 via Graph API
const uploadMessage = async (db, mailbox, emlBuffer, folderName) => {
  const { getValidToken } = require('./oauthHelper');
  const token = await getValidToken(db, mailbox);
  // Trova folder ID per nome
  const foldersRes = await graphFetch('https://graph.microsoft.com/v1.0/me/mailFolders?$top=100', token);
  if (!foldersRes.ok) throw new Error('Graph: impossibile ottenere cartelle');
  const foldersData = await foldersRes.json();
  const folder = foldersData.value?.find(f =>
    f.displayName?.toLowerCase() === (folderName||'inbox').toLowerCase()
  ) || foldersData.value?.find(f => f.wellKnownName === 'inbox');
  if (!folder) throw new Error('Graph: cartella non trovata: ' + folderName);

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/messages/$value`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: emlBuffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph upload: ${res.status} ${err}`);
  }
  return true;
};

module.exports = { syncMailbox, deleteMessages, uploadMessage };
