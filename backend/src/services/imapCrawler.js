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
  // Gestisce casi in cui il parser restituisce un oggetto invece di una stringa
  if (typeof str !== 'string') {
    try { str = String(str); } catch { return null; }
  }
  return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\uFFFD/g, '');
};

// Valida e corregge la data email
const parseEmailDate = (parsed, headers, imapDate) => {
  // Prova tutti i candidati in ordine di affidabilità
  const rawDates = [
    parsed.date,
    headers['date'],
    headers['Date'],
    headers['received'] ? extractDateFromReceived(headers['received']) : null,
    imapDate, // data interna IMAP (sempre disponibile e affidabile)
  ];

  for (const raw of rawDates) {
    if (!raw) continue;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (d instanceof Date && !isNaN(d.getTime()) && d.getFullYear() > 1970 && d.getFullYear() < 2100) {
      return d;
    }
  }

  // Fallback: data corrente (meglio che null o 1970)
  console.warn('[Crawler] Data email non parsabile, uso data corrente');
  return new Date();
};

// Estrae data dall'header Received (es: "... ; Thu, 12 May 2026 10:00:00 +0200")
const extractDateFromReceived = (received) => {
  try {
    const str = Array.isArray(received) ? received[0] : received;
    const match = str.match(/;\s*(.+)$/);
    if (match) {
      const d = new Date(match[1].trim());
      if (!isNaN(d.getTime())) return d;
    }
  } catch {}
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
      console.log(`[Crawler] OAuth MS token per ${mailbox.email}: ${accessToken ? accessToken.substring(0,20)+'...' : 'NULL'}`);
      const xoauth2str = `user=${mailbox.imap_user || mailbox.email}\x01auth=Bearer ${accessToken}\x01\x01`;
      imapConfig.xoauth2 = Buffer.from(xoauth2str).toString('base64');
      delete imapConfig.password;
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
  const folderResults = [];

  const processFolder = (folderPath) => new Promise((res, rej) => {
    imap.openBox(folderPath, true, async (err, box) => {
      if (err) return res(0);

      if (!box.messages.total) return res(0);

      const existing = await db.query(
        'SELECT uid FROM archived_emails WHERE mailbox_id=$1 AND path=$2',
        [mailbox.id, folderPath]
      );
      // Includi anche gli UID già archiviati/eliminati — così non vengono re-scaricati dall'IMAP
      const existingUids = new Set(existing.rows.map(r => r.uid));

      // Carica tutti i message_id noti (inclusi eliminati/archiviati) per bloccare re-archiviazione
      const existingMsgIds = await db.query(
        'SELECT message_id FROM archived_emails WHERE mailbox_id=$1 AND message_id IS NOT NULL',
        [mailbox.id]
      );
      const knownMessageIds = new Set(existingMsgIds.rows.map(r => r.message_id));

      // Leggi durata badge qui — siamo in contesto async
      const badgeSetting = await db.query(`SELECT value FROM settings WHERE key='badge_duration_days'`).catch(() => ({ rows: [] }));
      const badgeDays = parseInt(badgeSetting.rows[0]?.value || '30');

      imap.search(['ALL'], (err, uids) => {
        if (err) { console.error(`[Crawler] search error ${folderPath}:`, err.message); return res(0); }
        if (!uids.length) return res(0);
        console.log(`[Crawler] ${mailbox.email} — ${folderPath}: ${uids.length} email trovate`);

        const newUids = uids.filter(uid => !existingUids.has(uid));

        const serverUids = new Set(uids);
        const deletedUids = [...existingUids].filter(uid => !serverUids.has(uid));
        const restoredUids = [...serverUids].filter(uid => existingUids.has(uid));
        const updatePromises = [];
        if (deletedUids.length > 0) {
          updatePromises.push(
            db.query(
              `UPDATE archived_emails
               SET is_deleted=true,
                   badge_type=CASE WHEN badge_type='archived' THEN 'archived' ELSE 'deleted' END,
                   badge_expires_at=CASE WHEN badge_type='archived' THEN NULL
                                         ELSE NOW() + ($4 || ' days')::interval END
               WHERE mailbox_id=$1 AND path=$2 AND uid=ANY($3) AND is_deleted=false`,
              [mailbox.id, folderPath, deletedUids, badgeDays]
            ).then(() => console.log('[Crawler] ' + mailbox.email + ' ' + folderPath + ': ' + deletedUids.length + ' email eliminate esternamente'))
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

        // Pre-fetch leggero — scarica solo Message-ID per filtrare email già note
        // Evita di ri-scaricare email che il server IMAP ha riassegnato con UID nuovo
        const filterNewUids = (uidsToCheck) => new Promise((resolve) => {
          if (!knownMessageIds.size) return resolve(uidsToCheck);
          const unknown = [];
          let done = 0;
          const preFetch = imap.fetch(uidsToCheck, { bodies: 'HEADER.FIELDS (MESSAGE-ID)', struct: false });
          const uidMsgIds = {};
          preFetch.on('message', (msg) => {
            let uid = null;
            let msgId = null;
            msg.on('attributes', (attrs) => { uid = attrs.uid; });
            msg.on('body', (stream) => {
              let buf = '';
              stream.on('data', c => buf += c.toString());
              stream.on('end', () => {
                const m = buf.match(/Message-ID:\s*(.+)/i);
                if (m) msgId = m[1].trim();
              });
            });
            msg.once('end', () => { if (uid && msgId) uidMsgIds[uid] = msgId; done++; });
          });
          preFetch.once('error', () => resolve(uidsToCheck));
          preFetch.once('end', () => {
            for (const [uid, msgId] of Object.entries(uidMsgIds)) {
              if (!knownMessageIds.has(msgId)) unknown.push(parseInt(uid));
            }
            // UID senza Message-ID header → includili (verranno filtrati dopo)
            const withHeader = new Set(Object.keys(uidMsgIds).map(Number));
            for (const uid of uidsToCheck) {
              if (!withHeader.has(uid)) unknown.push(uid);
            }
            resolve(unknown);
          });
        });

        const batchSize = 50;
        let processed = 0;

        const fetchBatch = (batchUids) => new Promise((bRes) => {
          const fetch = imap.fetch(batchUids, { bodies: '', struct: true, envelope: true });
          const promises = [];

          fetch.on('message', (msg, seqno) => {
            let uid = null;
            let imapDate = null;
            let isSeen = false;
            let rawChunks = [];

            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
              imapDate = attrs.date || null;
              isSeen = (attrs.flags || []).includes('\\Seen');
            });
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
                    const dup = await db.query(
                      'SELECT id FROM archived_emails WHERE message_id=$1 AND mailbox_id=$2 LIMIT 1',
                      [parsed.messageId, mailbox.id]
                    );
                    isRestored = dup.rows.length > 0;
                  }

                  // Se message_id già noto (anche se eliminato/archiviato) → salta senza toccare nulla
                  if (parsed.messageId && knownMessageIds.has(parsed.messageId)) {
                    return; // non incrementare processed
                  }

                  // Filtro include_unread — se la policy dice solo lette, salta le non lette
                  const archivePolicy = mailbox.archive_policy;
                  const policyFilter = archivePolicy?.filter || {};
                  if (policyFilter.include_unread === false && !isSeen) {
                    return; // non incrementare processed
                  }

                  // Se message_id già archiviato, non reinserire — soprattutto se eliminato da policy
                  if (parsed.messageId) {
                    const exists = await db.query(
                      'SELECT id, path, badge_type, is_deleted FROM archived_emails WHERE mailbox_id=$1 AND message_id=$2 LIMIT 1',
                      [mailbox.id, parsed.messageId]
                    );
                    if (exists.rows.length > 0) {
                      const ex = exists.rows[0];
                      if (ex.badge_type === 'archived') {
                        return; // non incrementare processed
                      }
                      if (ex.path !== folderPath && !ex.is_deleted) {
                        await db.query(
                          'UPDATE archived_emails SET path=$1 WHERE id=$2',
                          [folderPath, ex.id]
                        );
                      }
                      return; // non incrementare processed
                    }
                  }
                  await db.query(
                    `INSERT INTO archived_emails 
                     (mailbox_id, uid, message_id, subject, sender_name, sender_email,
                      recipients, cc, bcc, sent_at, path, has_attachments, attachments,
                      raw, body_html, body_text, headers, spam_score, size_bytes, is_restored, compressed_size_bytes,
                      is_pec, pec_type)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
                     ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
                    [
                      mailbox.id, uid,
                      parsed.messageId || null,
                      sanitizeText(parsed.subject),
                      sanitizeText(parsed.from?.value?.[0]?.name),
                      parsed.from?.value?.[0]?.address || null,
                      JSON.stringify(parseRecipients(parsed.to)),
                      JSON.stringify(parseRecipients(parsed.cc)),
                      JSON.stringify(parseRecipients(parsed.bcc)),
                      parseEmailDate(parsed, headers, imapDate),
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

        // Filtra UID già noti tramite Message-ID prima del fetch completo
        filterNewUids(newUids).then(async (filteredUids) => {
          if (!filteredUids.length) return res(0);
          let total = 0;
          for (let i = 0; i < filteredUids.length; i += batchSize) {
            const batch = filteredUids.slice(i, i + batchSize);
            total += await fetchBatch(batch);
          }
          res(total);
        }).catch(() => res(0));
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

      // Cartelle da escludere — non contengono email (calendario, contatti, attività, bozze, spam)
      const EXCLUDED_FOLDERS = [
        'Calendar', 'Calendario', 'Calendars',
        'Contacts', 'Contatti', 'Contact',
        'Tasks', 'Attività', 'Notes', 'Note',
        'Drafts', 'Bozze',
        'Junk Email', 'Spam', 'Posta indesiderata',
        'Outbox', 'Posta in uscita',
        'Deleted Items', 'Posta eliminata', 'Trash',
        'Sync Issues', 'Conflicts', 'Local Failures', 'Server Failures',
      ];
      const isExcluded = (folder) => EXCLUDED_FOLDERS.some(ex =>
        folder === ex ||
        folder.startsWith(ex + '/') ||
        folder.startsWith(ex + '\\') ||
        folder.endsWith('/' + ex) ||
        folder.endsWith('\\' + ex)
      );

      for (const folder of folders) {
        if (isExcluded(folder)) {
          console.log(`[Crawler] ${mailbox.email} — skip cartella: ${folder}`);
          folderResults.push({ folder, skipped: true });
          continue;
        }
        try {
          const synced = await processFolder(folder);
          totalSynced += synced;
          folderResults.push({ folder, synced });
        } catch (e) {
          console.error(`Error processing folder ${folder}:`, e.message);
          folderResults.push({ folder, synced: 0, error: e.message });
        }
      }

      imap.end();
      resolve({ total: totalSynced, folders: folderResults });
    } catch (e) {
      imap.end();
      reject(e);
    }
  });

  imap.once('error', (err) => {
    console.error(`[Crawler] IMAP error ${mailbox.email}:`, err.message);
    try { imap.destroy(); } catch {}
    reject(err);
  });
  imap.once('end', () => {});

  // Previene crash Node.js su EPIPE non gestiti dalla libreria imap
  if (imap._socket) {
    imap._socket.on('error', (err) => {
      if (err.code === 'EPIPE') return; // già gestito sopra
    });
  }
  imap.connect();
});

module.exports = { syncMailbox };
