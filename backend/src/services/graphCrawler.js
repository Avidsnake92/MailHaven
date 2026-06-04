const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const { encryptBuffer } = require('./crypto');
const { getValidToken } = require('./oauthHelper');

// Fetch con retry su 429/503
const graphFetch = async (url, token, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (res.status === 429 || res.status === 503) {
      const wait = parseInt(res.headers.get('Retry-After') || '5') * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error('Graph API: troppi tentativi falliti');
};

// Elenca tutte le cartelle (ricorsivo)
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

const EXCLUDED_FOLDERS = ['drafts', 'junkemail', 'deleteditems', 'outbox', 'sentitems',
  'conflicts', 'localfailures', 'serverfailures', 'syncissues'];

const syncMailbox = async (mailbox, db) => {
  console.log(`[GraphCrawler] Avvio sync Graph API per ${mailbox.email}`);
  const token = await getValidToken(db, mailbox);
  if (!token) throw new Error('Token OAuth non disponibile');

  // Leggi badge duration
  const badgeSetting = await db.query("SELECT value FROM settings WHERE key='badge_duration_days'").catch(() => ({ rows: [] }));
  const badgeDays = parseInt(badgeSetting.rows[0]?.value || '30');

  const folders = await listFolders(token);
  let totalSynced = 0;
  const folderResults = [];

  for (const folder of folders) {
    const folderKey = (folder.wellKnownName || folder.displayName || '').toLowerCase().replace(/\s+/g, '');
    if (EXCLUDED_FOLDERS.some(e => folderKey.includes(e))) {
      folderResults.push({ folder: folder.displayName, skipped: true });
      continue;
    }

    const folderPath = folder.displayName;
    let synced = 0;

    // Pre-fetch message IDs già noti
    const existingR = await db.query(
      'SELECT message_id FROM archived_emails WHERE mailbox_id=$1 AND message_id IS NOT NULL',
      [mailbox.id]
    );
    const knownIds = new Set(existingR.rows.map(r => r.message_id));

    // Pagina messaggi
    let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/messages?$top=50&$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,hasAttachments,isRead&$orderby=receivedDateTime desc`;

    while (url) {
      const res = await graphFetch(url, token);
      if (!res.ok) { console.error(`[GraphCrawler] folder ${folderPath}: ${res.status}`); break; }
      const data = await res.json();
      const messages = data.value || [];

      for (const msg of messages) {
        const msgId = msg.internetMessageId || msg.id;
        if (knownIds.has(msgId)) continue;

        // Scarica raw RFC822
        const rawRes = await graphFetch(
          `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/$value`,
          token
        );
        if (!rawRes.ok) { console.error(`[GraphCrawler] raw fetch ${msg.id}: ${rawRes.status}`); continue; }

        const rawBuffer = Buffer.from(await rawRes.arrayBuffer());
        const rawGzipped = await gzip(rawBuffer);
        const rawCompressed = encryptBuffer(rawGzipped);

        const senderEmail = msg.from?.emailAddress?.address || null;
        const senderName = msg.from?.emailAddress?.name || null;
        const recipients = (msg.toRecipients || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const cc = (msg.ccRecipients || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const bcc = (msg.bccRecipients || []).map(r => ({ name: r.emailAddress?.name || '', email: r.emailAddress?.address || '' }));
        const sentAt = msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date();

        try {
          await db.query(
            `INSERT INTO archived_emails
             (mailbox_id, uid, message_id, subject, sender_name, sender_email,
              recipients, cc, bcc, sent_at, path, has_attachments,
              raw, size_bytes, compressed_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
            [
              mailbox.id,
              Math.abs(msgId.hashCode ? msgId.hashCode() : (msgId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0))),
              msgId,
              msg.subject || '(senza oggetto)',
              senderName,
              senderEmail,
              JSON.stringify(recipients),
              JSON.stringify(cc),
              JSON.stringify(bcc),
              sentAt,
              folderPath,
              msg.hasAttachments || false,
              rawCompressed,
              rawBuffer.length,
              rawGzipped.length,
            ]
          );
          knownIds.add(msgId);
          synced++;
        } catch (e) {
          if (!e.message.includes('unique')) console.error(`[GraphCrawler] save error:`, e.message);
        }
      }

      url = data['@odata.nextLink'] || null;
      // Ferma dopo la prima pagina se non ci sono novità (ottimizzazione)
      if (messages.length > 0 && messages.every(m => knownIds.has(m.internetMessageId || m.id))) break;
    }

    if (synced > 0) console.log(`[GraphCrawler] ${mailbox.email} — ${folderPath}: +${synced}`);
    totalSynced += synced;
    folderResults.push({ folder: folderPath, synced });
  }

  console.log(`[GraphCrawler] ${mailbox.email}: totale +${totalSynced} email`);
  return { total: totalSynced, folders: folderResults };
};

module.exports = { syncMailbox };