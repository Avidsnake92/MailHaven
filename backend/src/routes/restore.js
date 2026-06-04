const express = require('express');
const router = express.Router();
const Imap = require('imap');
const archiver = require('archiver');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { decrypt } = require('../services/crypto');
const { decompress } = require('../services/compression');
const { log } = require('../services/logger');
const { ERRORS, AppError } = require('../errors');

const getIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress;
};

router.use(authMiddleware);

// Helper: get email raw from DB
const getEmailFromDb = async (db, id, allowedMailboxIds) => {
  const r = await db.query(
    'SELECT id, subject, sender_email, sent_at, path, raw FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)',
    [id, allowedMailboxIds]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  if (row.raw) row.raw = await decompress(row.raw);
  return row;
};

// Helper: get allowed mailbox IDs for user
const getUserMailboxIds = async (db, user) => {
  if (user.role === 'superadmin' || user.role === 'admin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE active=true');
    return r.rows.map(r => r.id);
  }
  const r = await db.query(
    `SELECT m.id FROM mailboxes m
     JOIN user_mailboxes um ON um.mailbox_id = m.id
     WHERE um.user_id=$1 AND m.active=true`,
    [user.id]
  );
  return r.rows.map(r => r.id);
};

// Helper: upload EML to IMAP con data originale
const uploadToImap = (config, folder, emlBuffer, sentAt) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port || 993,
      tls: config.tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
    });

    imap.once('ready', () => {
      imap.openBox(folder, false, (err) => {
        if (err) {
          imap.addBox(folder, (addErr) => {
            if (addErr) { imap.end(); return reject(new Error(`Impossibile aprire/creare cartella: ${folder}`)); }
            appendMessage();
          });
        } else {
          appendMessage();
        }
      });

      function appendMessage() {
        // Usa la data originale dell'email — fondamentale per bulk restore
        const originalDate = sentAt ? new Date(sentAt) : new Date();
        imap.append(emlBuffer, { mailbox: folder, flags: ['\\Seen'], date: originalDate }, (appendErr) => {
          imap.end();
          if (appendErr) reject(appendErr);
          else resolve(true);
        });
      }
    });

    imap.once('error', (err) => reject(err));
    imap.connect();
  });
};

// Helper: ottieni mailbox completa per restore
const getMailboxForRestore = async (db, mailboxEmail) => {
  const result = await db.query(
    'SELECT * FROM mailboxes WHERE email=$1 AND active=true',
    [mailboxEmail]
  );
  return result.rows[0] || null;
};

// Helper: get IMAP config (solo caselle password)
const getImapConfig = (mailbox) => {
  if (!mailbox?.imap_password_encrypted) return null;
  return {
    host: mailbox.imap_host,
    port: mailbox.imap_port || 993,
    tls: mailbox.imap_tls !== false,
    user: mailbox.imap_user || mailbox.email,
    password: decrypt(mailbox.imap_password_encrypted),
  };
};

// POST /restore/imap — ripristina email su server IMAP
router.post('/imap', async (req, res, next) => {
  const { email_ids, target_mailbox, target_folder } = req.body;
  const db = req.app.locals.db;
  if (!email_ids?.length) return next(new AppError(ERRORS.MH_1402));
  if (!target_mailbox) return next(new AppError(ERRORS.MH_1503));
  try {
    const mailbox = await getMailboxForRestore(db, target_mailbox);
    if (!mailbox) return next(new AppError(ERRORS.MH_1204, target_mailbox));

    const allowedIds = await getUserMailboxIds(db, req.user);
    const s = await db.query(`SELECT value FROM settings WHERE key='badge_duration_days'`);
    const days = parseInt(s.rows[0]?.value || '30');
    const results = [];

    for (const id of email_ids) {
      try {
        const email = await getEmailFromDb(db, id, allowedIds);
        if (!email?.raw) {
          results.push({ id, success: false, code: ERRORS.MH_1501.code, error: ERRORS.MH_1501.message });
          continue;
        }
        const emlBuffer = Buffer.isBuffer(email.raw) ? email.raw : Buffer.from(email.raw);
        const folder = target_folder || 'INBOX';

        // Sceglie il metodo di restore in base al provider
        if (mailbox.oauth_provider === 'microsoft') {
          const { uploadMessage } = require('../services/graphCrawler');
          await uploadMessage(db, mailbox, emlBuffer, folder);
        } else if (mailbox.oauth_provider === 'google') {
          const { uploadMessage } = require('../services/gmailCrawler');
          await uploadMessage(db, mailbox, emlBuffer, folder);
        } else {
          const imapConfig = getImapConfig(mailbox);
          if (!imapConfig) throw new Error('Nessuna credenziale IMAP disponibile per questa casella');
          await uploadToImap(imapConfig, folder, emlBuffer, email.sent_at);
        }
        await db.query(
          `UPDATE archived_emails
           SET is_restored=true, is_deleted=false, deleted_at=NULL,
               badge_type='restored',
               badge_expires_at=NOW() + ($1 || ' days')::interval
           WHERE id=$2`,
          [days, id]
        );
        results.push({ id, success: true, folder });
      } catch (err) {
        results.push({ id, success: false, code: ERRORS.MH_1502.code, error: err.message });
      }
    }

    const ok = results.filter(r => r.success).length;
    await log(db, req.user.id, 'EMAIL_RESTORED', { email_ids, target_mailbox, target_folder, success: ok, total: email_ids.length }, getIp(req));

    const httpStatus = ok === 0 ? 502 : ok < email_ids.length ? 207 : 200;
    res.status(httpStatus).json({
      results,
      code: ok < email_ids.length ? ERRORS.MH_1504.code : undefined,
      message: `${ok}/${email_ids.length} email ripristinate con successo`,
    });
  } catch (err) {
    next(new AppError(ERRORS.MH_1502, err.message));
  }
});

// POST /restore/export/zip — esporta email come ZIP con EML
router.post('/export/zip', async (req, res) => {
  const { email_ids } = req.body;
  const db = req.app.locals.db;
  try {
    const allowedIds = await getUserMailboxIds(db, req.user);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="export_${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const id of email_ids) {
      try {
        const email = await getEmailFromDb(db, id, allowedIds);
        if (!email?.raw) continue;
        const raw = Buffer.isBuffer(email.raw) ? email.raw : Buffer.from(email.raw);
        const folder = (email.path || 'INBOX').replace(/\./g, '/');
        const subject = (email.subject || 'email').replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 50);
        const filename = `${folder}/${subject}_${id.substring(0, 8)}.eml`;
        archive.append(raw, { name: filename });
      } catch (err) { console.error(`Email ${id}:`, err.message); }
    }

    await log(db, req.user.id, 'EMAIL_EXPORTED', { email_ids, format: 'zip_eml', count: email_ids.length }, getIp(req));
    archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante export ZIP' });
  }
});

// POST /restore/export/mbox — esporta email come MBOX
router.post('/export/mbox', async (req, res) => {
  const { email_ids } = req.body;
  const db = req.app.locals.db;
  try {
    const allowedIds = await getUserMailboxIds(db, req.user);
    let mbox = '';

    for (const id of email_ids) {
      try {
        const email = await getEmailFromDb(db, id, allowedIds);
        if (!email?.raw) continue;
        const raw = (Buffer.isBuffer(email.raw) ? email.raw : Buffer.from(email.raw)).toString('utf8');
        const from = email.sender_email || 'unknown@unknown.com';
        const date = new Date(email.sent_at || Date.now()).toUTCString();
        mbox += `From ${from} ${date}\r\n${raw}\r\n\r\n`;
      } catch (err) { console.error(`Email ${id}:`, err.message); }
    }

    await log(db, req.user.id, 'EMAIL_EXPORTED', { email_ids, format: 'mbox', count: email_ids.length }, getIp(req));
    res.setHeader('Content-Type', 'application/mbox');
    res.setHeader('Content-Disposition', 'attachment; filename="export.mbox"');
    res.send(mbox);
  } catch (err) {
    res.status(500).json({ error: 'Errore durante export MBOX' });
  }
});

// POST /restore/export/mailbox — esporta intera casella come ZIP
router.post('/export/mailbox', async (req, res) => {
  const { mailbox_id } = req.body;
  const db = req.app.locals.db;
  try {
    const mbResult = await db.query('SELECT * FROM mailboxes WHERE id=$1', [mailbox_id]);
    if (!mbResult.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });
    const mailbox = mbResult.rows[0];

    const emailsResult = await db.query(
      'SELECT id, subject, sender_email, sent_at, path, raw FROM archived_emails WHERE mailbox_id=$1 ORDER BY sent_at DESC',
      [mailbox_id]
    );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${mailbox.email}_${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const email of emailsResult.rows) {
      try {
        if (!email.raw) continue;
        const raw = await decompress(Buffer.isBuffer(email.raw) ? email.raw : Buffer.from(email.raw));
        const folder = (email.path || 'INBOX').replace(/\./g, '/');
        const subject = (email.subject || 'email').replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 50);
        const filename = `${folder}/${subject}_${email.id.substring(0, 8)}.eml`;
        archive.append(raw, { name: filename });
      } catch (err) { console.error(`Email ${email.id}:`, err.message); }
    }

    await log(db, req.user.id, 'MAILBOX_EXPORTED', { mailbox: mailbox.email, count: emailsResult.rows.length }, getIp(req));
    archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante export casella' });
  }
});

module.exports = router;
