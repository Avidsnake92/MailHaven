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

// Provider noti con SSL datato o configurazione specifica

// Rimuove byte null e caratteri invalidi per PostgreSQL UTF8
const sanitizeText = (str) => {
  if (str == null) return null;
  return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\uFFFD/g, '');
};

// Valida e corregge la data email
const parseEmailDate = (parsed, headers) => {
  const candidates = [
    parsed.date,
    headers['date'] ? new Date(headers['date']) : null,
  ];
  for (const d of candidates) {
    if (d && d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() > 1990) return d;
  }
  return null;
};


const LEGACY_PROVIDERS = {
  'tiscali.it':    { host: 'imap.tiscali.it',      port: 993, tls: true,  legacy: true  },
  'libero.it':     { host: 'imapmail.libero.it',    port: 993, tls: true,  legacy: true  },
  'virgilio.it':   { host: 'imap.virgilio.it',      port: 993, tls: true,  legacy: true  },
  'tin.it':        { host: 'imap.tin.it',           port: 993, tls: true,  legacy: true  },
  'alice.it':      { host: 'imap.alice.it',         port: 993, tls: true,  legacy: true  },
  'tim.it':        { host: 'imap.tim.it',           port: 993, tls: true,  legacy: true  },
  'gmail.com':     { host: 'imap.gmail.com',        port: 993, tls: true,  legacy: false },
  'outlook.com':   { host: 'outlook.office365.com', port: 993, tls: true,  legacy: false },
  'hotmail.com':   { host: 'outlook.office365.com', port: 993, tls: true,  legacy: false },
  'hotmail.it':    { host: 'outlook.office365.com', port: 993, tls: true,  legacy: false },
  'live.com':      { host: 'outlook.office365.com', port: 993, tls: true,  legacy: false },
  'yahoo.com':     { host: 'imap.mail.yahoo.com',   port: 993, tls: true,  legacy: false },
  'yahoo.it':      { host: 'imap.mail.yahoo.com',   port: 993, tls: true,  legacy: false },
  // Provider PEC italiani
  'pec.aruba.it':     { host: 'imaps.pec.aruba.it',    port: 993, tls: true, legacy: false, isPec: true },
  'arubapec.it':      { host: 'imaps.pec.aruba.it',    port: 993, tls: true, legacy: false, isPec: true },
  'legalmail.it':     { host: 'imap.legalmail.it',      port: 993, tls: true, legacy: false, isPec: true },
  'peclib.it':        { host: 'imap.peclib.it',         port: 993, tls: true, legacy: false, isPec: true },
  'pec.namirial.com': { host: 'imap.pec.namirial.com', port: 993, tls: true, legacy: false, isPec: true },
  'pec.it':           { host: 'imap.pec.it',            port: 993, tls: true, legacy: false, isPec: true },
  'pec.poste.it':     { host: 'imap.pec.poste.it',     port: 993, tls: true, legacy: false, isPec: true },
  'postecert.it':     { host: 'imap.pec.poste.it',     port: 993, tls: true, legacy: false, isPec: true },
  'pec.tim.it':       { host: 'imap.pec.tim.it',       port: 993, tls: true, legacy: false, isPec: true },
  'registerpec.it':   { host: 'imap.registerpec.it',   port: 993, tls: true, legacy: false, isPec: true },
};


// Rileva se un'email è PEC e il tipo di ricevuta
const detectPec = (headers, emailDomain, providerIsPec) => {
  const h = (key) => {
    const v = headers[key] || headers[key.toLowerCase()];
    return v ? String(Array.isArray(v) ? v[0] : v).toLowerCase() : '';
  };
  
  // Controlla header specifici PEC
  const xRicevuta = h('x-ricevuta');
  const xTipoRicevuta = h('x-tiporicevuta');
  const xVerifica = h('x-verificasicurezza');
  const xTrasporto = h('x-trasporto');
  const xPec = h('x-pec');
  
  const hasPecHeaders = !!(xRicevuta || xTipoRicevuta || xVerifica || xTrasporto || xPec);
  
  // Controlla dominio mittente/destinatario
  const domainIsPec = providerIsPec || 
    (emailDomain && (emailDomain.includes('pec') || emailDomain.includes('cert') || emailDomain.includes('legalmail')));
  
  if (!hasPecHeaders && !domainIsPec) return { isPec: false, pecType: null };
  
  // Determina tipo ricevuta
  let pecType = 'normale';
  if (xTipoRicevuta) {
    if (xTipoRicevuta.includes('accettazione')) pecType = 'accettazione';
    else if (xTipoRicevuta.includes('consegna')) pecType = 'consegna';
    else if (xTipoRicevuta.includes('errore')) pecType = 'errore';
    else if (xTipoRicevuta.includes('avanzamento')) pecType = 'avanzamento';
    else if (xTipoRicevuta.includes('presa_in_carico')) pecType = 'presa_in_carico';
    else pecType = xTipoRicevuta;
  } else if (xRicevuta) {
    pecType = xRicevuta;
  }
  
  return { isPec: true, pecType };
};

const syncMailbox = async (mailbox, db) => new Promise(async (resolve, reject) => {
  const emailDomain = (mailbox.email || '').split('@')[1]?.toLowerCase();
  const provider = LEGACY_PROVIDERS[emailDomain];
  const isLegacy = !!provider?.legacy;

  let imapConfig = {
    user: mailbox.imap_user || mailbox.email,
    host: provider?.host || mailbox.imap_host,
    port: provider?.port || mailbox.imap_port || 993,
    tls: provider ? provider.tls : (mailbox.imap_tls !== false),
    tlsOptions: {
      rejectUnauthorized: false,
      ...(isLegacy ? {
        minVersion: 'TLSv1',
        ciphers: 'ALL',
      } : {})
    },
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
    } else if (mailbox.oauth_provider === 'google' && mailbox.oauth_access_token) {
      const { getValidGoogleToken } = require('../routes/oauth');
      const accessToken = await getValidGoogleToken(db, mailbox);
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
      if (err) return res(0);

      if (!box.messages.total) return res(0);

      const existing = await db.query(
        'SELECT uid FROM archived_emails WHERE mailbox_id=$1 AND path=$2',
        [mailbox.id, folderPath]
      );
      const existingUids = new Set(existing.rows.map(r => r.uid));

      imap.search(['ALL'], (err, uids) => {
        if (err || !uids.length) return res(0);

        const newUids = uids.filter(uid => !existingUids.has(uid));

        const serverUids = new Set(uids);
        const deletedUids = [...existingUids].filter(uid => !serverUids.has(uid));
        const restoredUids = [...serverUids].filter(uid => existingUids.has(uid));
        const updatePromises = [];
        if (deletedUids.length > 0) {
          updatePromises.push(
            db.query(
              'UPDATE archived_emails SET is_deleted=true WHERE mailbox_id=$1 AND path=$2 AND uid=ANY($3) AND is_deleted=false',
              [mailbox.id, folderPath, deletedUids]
            ).then(() => console.log('[Crawler] ' + mailbox.email + ' ' + folderPath + ': ' + deletedUids.length + ' email eliminate'))
          );
        }
        if (restoredUids.length > 0) {
          updatePromises.push(
            db.query(
              'UPDATE archived_emails SET is_deleted=false WHERE mailbox_id=$1 AND path=$2 AND uid=ANY($3) AND is_deleted=true',
              [mailbox.id, folderPath, restoredUids]
            )
          );
        }
        Promise.all(updatePromises).catch(e => console.error('[Crawler] Delete detection error:', e.message));

        if (!newUids.length) return res(0);

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
                  const rawGzipped = await gzip(raw);
                  const compressedSize = rawGzipped.length;
                  const rawCompressed = encryptBuffer(rawGzipped);
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
                  const emailDomain = (mailbox.email||'').split('@')[1]?.toLowerCase();
                  const providerIsPec = !!(LEGACY_PROVIDERS[emailDomain]?.isPec)||(mailbox.imap_host||'').toLowerCase().includes('pec');
                  const { isPec, pecType } = detectPec(headers, emailDomain, providerIsPec);

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
                      raw, body_html, body_text, headers, spam_score, size_bytes, is_restored, compressed_size_bytes,
                      is_pec, pec_type)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
                     ON CONFLICT (mailbox_id, uid, path) DO NOTHING
                     ON CONFLICT (mailbox_id, message_id) WHERE message_id IS NOT NULL DO UPDATE SET is_restored = EXCLUDED.is_restored;
                      -- Se esiste già per message_id, non duplicare
                      if (isPec !== undefined) {
                        await db.query(
                          `DELETE FROM archived_emails 
                           WHERE mailbox_id = $1 AND message_id = $2 
                           AND id != (SELECT id FROM archived_emails WHERE mailbox_id = $1 AND message_id = $2 ORDER BY uid DESC LIMIT 1)`,
                          [mailbox.id, parsed.messageId]
                        ).catch(() => {})
                      }`,
                    [
                      mailbox.id, uid,
                      parsed.messageId || null,
                      sanitizeText(parsed.subject),
                      sanitizeText(parsed.from?.value?.[0]?.name),
                      parsed.from?.value?.[0]?.address || null,
                      JSON.stringify(parseRecipients(parsed.to)),
                      JSON.stringify(parseRecipients(parsed.cc)),
                      JSON.stringify(parseRecipients(parsed.bcc)),
                      parseEmailDate(parsed, headers),
                      folderPath,
                      attachments.length > 0,
                      JSON.stringify(attachments),
                      raw,
                      sanitizeText(parsed.html),
                      sanitizeText(parsed.text),
                      JSON.stringify(headers),
                      spamScore,
                      raw.length,
                      isRestored,
                      compressedSize,
                      isPec,
                      pecType,
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
