const Imap = require('imap');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const { simpleParser } = require('mailparser');
const { decrypt, encryptBuffer } = require('./crypto');

const parseRecipients = (addr) => {
  if (!addr) return [];
  const list = Array.isArray(addr.value) ? addr.value : [addr.value];
  return list.filter(Boolean).map(a => ({ name: a.name || '', email: a.address || '' }));
};

const getSpamScore = (headers) => {
  const score = headers.get?.('x-spam-score') || headers['x-spam-score'];
  if (score === undefined || score === null) return null;
  const val = parseFloat(Array.isArray(score) ? score[0] : score);
  return isNaN(val) ? null : val;
};

const syncMailbox = async (mailbox, db) => new Promise(async (resolve, reject) => {
  let imapConfig = {
    user: mailbox.imap_user || mailbox.email,
    host: mailbox.imap_host,
    port: mailbox.imap_port || 993,
    tls: mailbox.imap_tls !== false,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 30000,
    authTimeout: 15000,
  };

  try {
    if (mailbox.oauth_provider === 'microsoft' && mailbox.oauth_access_token) {
      const { getValidToken } = require('./oauthHelper');
      const accessToken = await getValidToken(db, mailbox);
      imapConfig.xoauth2 = Buffer.from(
        `user=${mailbox.imap_user || mailbox.email}\x01auth=Bearer ${accessToken}\x01\x01`
      ).toString('base64');
    } else {
      imapConfig.password = decrypt(mailbox.imap_password_encrypted);
    }
  } catch (e) {
    return reject(new Error('Impossibile ottenere credenziali IMAP: ' + e.message));
  }

  const imap = new Imap(imapConfig);

  let totalSynced = 0;

  const processFolder = (folderPath) => new Promise((res, rej) => {
    imap.openBox(folderPath, true, async (err, box) => {
      if (err) return res(0); // skip inaccessible folders

      if (!box.messages.total) return res(0);

      // Get already synced UIDs for this folder
      const existing = await db.query(
        'SELECT uid FROM archived_emails WHERE mailbox_id=$1 AND path=$2',
        [mailbox.id, folderPath]
      );
      const existingUids = new Set(existing.rows.map(r => r.uid));

      // Fetch all UIDs
      imap.search(['ALL'], (err, uids) => {
        if (err || !uids.length) return res(0);

        const newUids = uids.filter(uid => !existingUids.has(uid));
        if (!newUids.length) return res(0);

        // Fetch in batches of 50
        const batchSize = 50;
        let processed = 0;

        const fetchBatch = (batchUids) => new Promise((bRes) => {
          const fetch = imap.fetch(batchUids, { bodies: '', struct: true });
          const promises = [];

          fetch.on('message', (msg, seqno) => {
            let uid = null;
            let rawChunks = [];

            msg.on('attributes', (attrs) => { uid = attrs.uid; });
            msg.on('body', (stream) => {
              stream.on('data', chunk => rawChunks.push(chunk));
            });

            msg.once('end', () => {
              promises.push((async () => {
                try {
                  const raw = Buffer.concat(rawChunks);
                  const rawCompressed = encryptBuffer(await gzip(raw));
                  const parsed = await simpleParser(raw);

                  const attachments = (parsed.attachments || []).map(a => ({
                    filename: a.filename || 'attachment',
                    contentType: a.contentType,
                    size: a.size || 0,
                  }));

                  const headers = {};
                  parsed.headers.forEach((val, key) => {
                    headers[key] = Array.isArray(val) ? val.join(', ') : String(val);
                  });

                  const spamScore = getSpamScore(parsed.headers);

                  // Controlla se esiste già un'email con stesso message_id (è un restore)
                  let isRestored = false;
                  if (parsed.messageId) {
                    const existing = await db.query(
                      'SELECT id FROM archived_emails WHERE message_id=$1 AND mailbox_id=$2 LIMIT 1',
                      [parsed.messageId, mailbox.id]
                    );
                    isRestored = existing.rows.length > 0;
                  }

                  await db.query(
                    `INSERT INTO archived_emails 
                     (mailbox_id, uid, message_id, subject, sender_name, sender_email,
                      recipients, cc, bcc, sent_at, path, has_attachments, attachments,
                      raw, body_html, body_text, headers, spam_score, size_bytes, is_restored)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                     ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
                    [
                      mailbox.id, uid,
                      parsed.messageId || null,
                      parsed.subject || null,
                      parsed.from?.value?.[0]?.name || null,
                      parsed.from?.value?.[0]?.address || null,
                      JSON.stringify(parseRecipients(parsed.to)),
                      JSON.stringify(parseRecipients(parsed.cc)),
                      JSON.stringify(parseRecipients(parsed.bcc)),
                      parsed.date || null,
                      folderPath,
                      attachments.length > 0,
                      JSON.stringify(attachments),
                      raw,
                      parsed.html || null,
                      parsed.text || null,
                      JSON.stringify(headers),
                      spamScore,
                      raw.length,
                    ]
                  );
                  processed++;
                } catch (e) {
                  console.error(`Error saving email uid ${uid}:`, e.message);
                }
              })());
            });
          });

          fetch.once('end', async () => {
            await Promise.all(promises);
            bRes(processed);
          });
          fetch.once('error', () => bRes(0));
        });

        // Process in batches
        const runBatches = async () => {
          let total = 0;
          for (let i = 0; i < newUids.length; i += batchSize) {
            const batch = newUids.slice(i, i + batchSize);
            total += await fetchBatch(batch);
          }
          res(total);
        };
        runBatches().catch(() => res(0));
      });
    });
  });

  imap.once('ready', async () => {
    try {
      // Get all folders
      const folders = await new Promise((res, rej) => {
        imap.getBoxes((err, boxes) => {
          if (err) return rej(err);
          const paths = [];
          const walk = (node, prefix = '') => {
            Object.entries(node).forEach(([name, box]) => {
              const path = prefix ? `${prefix}${box.delimiter || '/'}${name}` : name;
              if (!box.attribs?.includes('\\Noselect')) paths.push(path);
              if (box.children) walk(box.children, path);
            });
          };
          walk(boxes);
          res(paths);
        });
      });

      for (const folder of folders) {
        try {
          const synced = await processFolder(folder);
          totalSynced += synced;
        } catch (e) {
          console.error(`Error processing folder ${folder}:`, e.message);
        }
      }

      imap.end();
      resolve(totalSynced);
    } catch (e) {
      imap.end();
      reject(e);
    }
  });

  imap.once('error', (err) => reject(err));
  imap.once('end', () => {});
  imap.connect();
});

module.exports = { syncMailbox };
