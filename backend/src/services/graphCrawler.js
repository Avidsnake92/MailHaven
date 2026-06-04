const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const { encryptBuffer } = require('./crypto');
const { getValidToken } = require('./oauthHelper');

// UID stabile da message_id (evita collisioni con hash CRC32-like)
const stableUid = (msgId) => {
  const h = crypto.createHash('sha256').update(msgId).digest();
  return h.readUInt32BE(0);
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

const listFolders = async (token) => {
  const folders = [];
  let url = 'https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&includeHiddenFolders=true';
  while (url) {
    const res = await graphFetch(url, token);
    if (!res.ok) throw new Error(`Graph listFolders: ${res.status} ${await res.text()}`);
    const data = await res.json();
    folders.push(...(data.value || []));
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

    const folderPath = folder.displayName;

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

module.exports = { syncMailbox };