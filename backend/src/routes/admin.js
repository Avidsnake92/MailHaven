const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { log } = require('../services/logger');
const getIp = (req) => { const fwd = req.headers['x-forwarded-for']; return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress; };

router.use(authMiddleware);
router.use(requireRole('admin', 'superadmin'));

// ---- CLIENTS ----
router.get('/clients', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM clients ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/clients', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company } = req.body;
  try {
    const result = await db.query('INSERT INTO clients (name, company) VALUES ($1, $2) RETURNING *', [name, company]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.put('/clients/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, active } = req.body;
  try {
    const result = await db.query(
      'UPDATE clients SET name=$1, company=$2, active=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [name, company, active !== undefined ? active : true, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/clients/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ message: 'Cliente eliminato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- USERS ----
router.get('/users', async (req, res) => {
  const db = req.app.locals.db;
  try {
    let result;
    if (req.user.role === 'superadmin') {
      result = await db.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.active, u.last_login, u.client_id, c.name as client_name
         FROM users u LEFT JOIN clients c ON u.client_id = c.id ORDER BY u.created_at DESC`
      );
    } else {
      result = await db.query(
        `SELECT u.id, u.email, u.full_name, u.role, u.active, u.last_login, u.client_id, c.name as client_name
         FROM users u LEFT JOIN clients c ON u.client_id = c.id
         WHERE u.client_id = $1 ORDER BY u.created_at DESC`,
        [req.user.client_id]
      );
    }
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/users', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, full_name, role, client_id } = req.body;
  if (req.user.role === 'admin' && role !== 'user') {
    return res.status(403).json({ error: 'Non puoi creare utenti con questo ruolo' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, client_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, full_name, role, client_id',
      [email, hash, full_name, role, client_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email già esistente' });
    res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/users/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { full_name, role, active, client_id, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE users SET full_name=$1, role=$2, active=$3, client_id=$4, password_hash=$5, updated_at=NOW() WHERE id=$6',
        [full_name, role, active, client_id || null, hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET full_name=$1, role=$2, active=$3, client_id=$4, updated_at=NOW() WHERE id=$5',
        [full_name, role, active, client_id || null, req.params.id]
      );
    }
    res.json({ message: 'Utente aggiornato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/users/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Utente eliminato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Test IMAP connection natively
router.post('/mailboxes/test-imap', async (req, res) => {
  const { imap_host, imap_port, imap_user, imap_password, imap_tls, email } = req.body;
  const Imap = require('imap');
  const host = imap_host || `mail.${email?.split('@')[1]}`;
  try {
    await new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imap_user || email, password: imap_password,
        host, port: imap_port || 993, tls: imap_tls !== false,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15000, authTimeout: 10000,
      });
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', (err) => reject(err));
      imap.connect();
    });
    res.json({ success: true, message: 'Connessione IMAP riuscita!' });
  } catch (err) {
    res.status(400).json({ success: false, error: `Connessione fallita: ${err.message}` });
  }
});

router.get('/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT m.id, m.client_id, m.email, m.display_name,
              m.imap_host, m.imap_port, m.imap_tls, m.imap_user, m.active,
              CASE WHEN m.imap_password_encrypted IS NOT NULL THEN true ELSE false END as has_password,
              c.name as client_name,
              (SELECT COUNT(*) FROM archived_emails ae WHERE ae.mailbox_id = m.id) as email_count
       FROM mailboxes m LEFT JOIN clients c ON m.client_id = c.id ORDER BY m.email`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  const { client_id, email, display_name, imap_host, imap_port, imap_tls, imap_user, imap_password } = req.body;
  const { encrypt } = require('../services/crypto');
  const ip = getIp(req);
  try {
    const result = await db.query(
      `INSERT INTO mailboxes (client_id, email, display_name, imap_host, imap_port, imap_tls, imap_user, imap_password_encrypted) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, display_name, client_id`,
      [client_id, email, display_name,
       imap_host || `mail.${email.split('@')[1]}`,
       imap_port || 993, imap_tls !== false,
       imap_user || email,
       imap_password ? encrypt(imap_password) : null]
    );
    await log(db, req.user.id, 'MAILBOX_CREATED', { email }, ip);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

router.put('/mailboxes/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { client_id, email, display_name, active, imap_host, imap_port, imap_tls, imap_user, imap_password } = req.body;
  const { encrypt } = require('../services/crypto');
  try {
    if (imap_password) {
      await db.query(
        `UPDATE mailboxes SET client_id=$1, email=$2, display_name=$3,
         active=$4, imap_host=$5, imap_port=$6, imap_tls=$7, imap_user=$8, imap_password_encrypted=$9 WHERE id=$10`,
        [client_id, email, display_name, active !== undefined ? active : true,
         imap_host, imap_port || 993, imap_tls !== false, imap_user || email, encrypt(imap_password), req.params.id]
      );
    } else {
      await db.query(
        `UPDATE mailboxes SET client_id=$1, email=$2, display_name=$3,
         active=$4, imap_host=$5, imap_port=$6, imap_tls=$7, imap_user=$8 WHERE id=$9`,
        [client_id, email, display_name, active !== undefined ? active : true,
         imap_host, imap_port || 993, imap_tls !== false, imap_user || email, req.params.id]
      );
    }
    res.json({ message: 'Casella aggiornata' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/mailboxes/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM mailboxes WHERE id=$1', [req.params.id]);
    res.json({ message: 'Casella eliminata' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Sync now for a specific mailbox
router.post('/mailboxes/:id/sync', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });
    res.json({ message: 'Sincronizzazione avviata' });
    const { syncMailbox } = require('../services/imapCrawler');
    setImmediate(async () => {
      try {
        const n = await syncMailbox(r.rows[0], db);
        // console.log(`Sync ${r.rows[0].email}: +${n} emails`);
      } catch (e) { console.error('Sync error:', e.message); }
    });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Sync status
router.get('/sync-status', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      `SELECT sl.*, m.email as mailbox_email FROM sync_log sl
       JOIN mailboxes m ON m.id = sl.mailbox_id
       ORDER BY sl.started_at DESC LIMIT 20`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Assign mailboxes to user
router.post('/users/:userId/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_ids } = req.body;
  try {
    await db.query('DELETE FROM user_mailboxes WHERE user_id = $1', [req.params.userId]);
    for (const mid of mailbox_ids) {
      await db.query('INSERT INTO user_mailboxes (user_id, mailbox_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.userId, mid]);
    }
    res.json({ message: 'Caselle assegnate' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /admin/users?client_id=X — utenti di un cliente
router.get('/users', async (req, res) => {
  const db = req.app.locals.db;
  const { client_id } = req.query;
  try {
    let query, params;
    if (client_id) {
      query = `SELECT DISTINCT u.id, u.email, u.full_name, u.role 
               FROM users u
               LEFT JOIN user_clients uc ON uc.user_id = u.id
               WHERE (uc.client_id = $1 OR u.role IN ('admin','superadmin'))
               AND u.active = true
               ORDER BY u.full_name`;
      params = [client_id];
    } else {
      query = `SELECT id, email, full_name, role FROM users WHERE active=true ORDER BY full_name`;
      params = [];
    }
    const r = await db.query(query, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /admin/mailboxes/:id/users — utenti assegnati a una casella
router.get('/mailboxes/:id/users', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      'SELECT user_id FROM user_mailboxes WHERE mailbox_id=$1',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// POST /admin/mailboxes/:id/users — assegna utenti a una casella
router.post('/mailboxes/:id/users', async (req, res) => {
  const db = req.app.locals.db;
  const { user_ids } = req.body;
  try {
    await db.query('DELETE FROM user_mailboxes WHERE mailbox_id=$1', [req.params.id]);
    for (const uid of (user_ids || [])) {
      await db.query(
        'INSERT INTO user_mailboxes (user_id, mailbox_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [uid, req.params.id]
      );
    }
    res.json({ message: 'Utenti assegnati' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

module.exports = router;

// ---- ACTIVITY LOG ----
router.get('/logs', async (req, res) => {
  const db = req.app.locals.db;
  const { page = 1, limit = 50, user_id, action } = req.query;
  const offset = (page - 1) * limit;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (user_id) { params.push(user_id); where += ` AND l.user_id = $${params.length}`; }
    if (action) { params.push(`%${action}%`); where += ` AND l.action ILIKE $${params.length}`; }

    params.push(limit); params.push(offset);
    const result = await db.query(
      `SELECT l.id, l.action, l.details, l.ip_address, l.created_at,
              u.email as user_email, u.full_name as user_name, u.role as user_role
       FROM activity_log l
       LEFT JOIN users u ON l.user_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const count = await db.query(`SELECT COUNT(*) FROM activity_log l ${where}`, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(count.rows[0].count / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// ---- ACCOUNT MANAGEMENT ----
// Unlock a locked account
router.post('/users/:id/unlock', requireRole('superadmin', 'admin'), async (req, res) => {
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    const result = await db.query('SELECT email, full_name FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Utente non trovato' });
    
    await db.query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1',
      [req.params.id]
    );
    await log(db, req.user.id, 'ACCOUNT_UNLOCKED', { 
      unlocked_user: result.rows[0].email,
      by: req.user.email 
    }, ip);
    res.json({ message: 'Account sbloccato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Reset 2FA for a user (admin only)
router.post('/users/:id/reset-2fa', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    const result = await db.query('SELECT email FROM users WHERE id = $1', [req.params.id]);
    await db.query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.params.id]);
    await log(db, req.user.id, '2FA_RESET_BY_ADMIN', { 
      target_user: result.rows[0]?.email, by: req.user.email 
    }, ip);
    res.json({ message: '2FA resettato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- AV LOG ----
router.get('/av-logs', async (req, res) => {
  const db = req.app.locals.db;
  const { page = 1, limit = 50, status } = req.query;
  const offset = (page - 1) * limit;
  try {
    let where = status ? `WHERE a.status = '${status}'` : '';
    const result = await db.query(
      `SELECT a.*, u.email as user_email, u.full_name as user_name
       FROM av_log a LEFT JOIN users u ON a.scanned_by = u.id
       ${where} ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await db.query(`SELECT COUNT(*) FROM av_log a ${where}`);
    res.json({ logs: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), totalPages: Math.ceil(count.rows[0].count / limit) });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- SETTINGS ----
router.get('/settings', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT key, value FROM settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/settings', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.query(
        'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, String(value)]
      );
    }
    res.json({ message: 'Impostazioni salvate' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- AV UPDATE ----
router.post('/av/update', requireRole('superadmin'), async (req, res) => {
  const { exec } = require('child_process');
  exec('freshclam --quiet 2>&1', (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: 'Errore aggiornamento ClamAV: ' + (stderr || err.message) });
    res.json({ message: 'Database ClamAV aggiornato con successo' });
  });
});

// ---- SMTP TEST ----
router.post('/smtp/test', requireRole('superadmin'), async (req, res) => {
  const nodemailer = require('nodemailer');
  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: smtp_host, port: parseInt(smtp_port) || 465,
      secure: smtp_secure === true || smtp_secure === 'true',
      auth: smtp_user ? { user: smtp_user, pass: smtp_pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: smtp_user || 'noreply@mailvault.local',
      to: smtp_user,
      subject: 'MailHaven — Test SMTP',
      text: 'Configurazione SMTP funzionante!',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Riavvia scheduler AV dopo salvataggio impostazioni
router.post('/av/restart-scheduler', requireRole('superadmin'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const avScheduler = require('../services/avScheduler');
    avScheduler.stop();
    await avScheduler.start(db);
    res.json({ message: 'Scheduler AV riavviato' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
