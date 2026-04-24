const express = require('express');
const router = express.Router();
const Imap = require('imap');
const archiver = require('archiver');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { decrypt } = require('../services/crypto');
const { decompress } = require('../services/compression');
const { log } = require('../services/logger');

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
    'SELECT m.id FROM mailboxes m JOIN clients c ON m.client_id=c.id JOIN user_clients uc ON c.id=uc.client_id WHERE uc.user_id=$1 AND m.active=true',
    [user.id]
  );
  return r.rows.map(r => r.id);
};

// Helper: upload EML to IMAP
const uploadToImap = (config, folder, emlBuffer) => {
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
        imap.append(emlBuffer, { mailbox: folder, flags: ['\\Seen'] }, (appendErr) => {
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

// Helper: get IMAP config from DB
const getImapConfig = async (db, mailboxEmail) => {
  const result = await db.query(
    'SELECT imap_host, imap_port, imap_tls, imap_user, imap_password_encrypted FROM mailboxes WHERE email=$1 AND active=true',
    [mailboxEmail]
  );
  if (!result.rows[0]?.imap_password_encrypted) return null;
  const row = result.rows[0];
  return {
    host: row.imap_host,
    port: row.imap_port || 993,
    tls: row.imap_tls !== false,
    user: row.imap_user || mailboxEmail,
    password: decrypt(row.imap_password_encrypted),
  };
};

// POST /restore/imap — ripristina email su server IMAP
router.post('/imap', async (req, res) => {
  const { email_ids, target_mailbox, target_folder } = req.body;
  const db = req.app.locals.db;
  try {
    const imapConfig = await getImapConfig(db, target_mailbox);
    if (!imapConfig) {
      return res.status(400).json({
        error: `Credenziali IMAP non configurate per ${target_mailbox}.`
      });
    }

    const allowedIds = await getUserMailboxIds(db, req.user);
    const results = [];

    for (const id of email_ids) {
      try {
        const email = await getEmailFromDb(db, id, allowedIds);
        if (!email?.raw) {
          results.push({ id, success: false, error: 'Contenuto non disponibile' });
          continue;
        }
        const emlBuffer = Buffer.isBuffer(email.raw) ? email.raw : Buffer.from(email.raw);
        const folder = target_folder || email.path || 'INBOX';
        await uploadToImap(imapConfig, folder, emlBuffer);
        // Marca l'originale come sorgente di un restore
        await db.query('UPDATE archived_emails SET is_restored=false WHERE id=$1', [id]);
        results.push({ id, success: true, folder });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }

    const ok = results.filter(r => r.success).length;
    await log(db, req.user.id, 'EMAIL_RESTORED', { email_ids, target_mailbox, target_folder, success: ok, total: email_ids.length }, getIp(req));
    res.json({ results, message: `${ok}/${email_ids.length} email ripristinate con successo` });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: err.message || 'Errore durante il restore' });
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
