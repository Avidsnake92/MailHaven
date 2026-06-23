const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');

// ── Genera token plugin (autenticato via web) ──────────────────────────────
router.post('/tokens', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { name, client_type, expires_days = 30 } = req.body;
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO plugin_tokens (user_id, token, name, client_type, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, token, name || 'Plugin Token', client_type || 'generic', expiresAt]
    );
    res.json({ token, expires_at: expiresAt, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lista token dell'utente ────────────────────────────────────────────────
router.get('/tokens', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      'SELECT id, name, client_type, last_used_at, expires_at, created_at FROM plugin_tokens WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Revoca token ───────────────────────────────────────────────────────────
router.delete('/tokens/:id', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM plugin_tokens WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Token revocato' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login plugin con email+password (per primo accesso) ───────────────────
router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, client_type } = req.body;
  try {
    const r = await db.query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
    if (!r.rows[0]) return res.status(401).json({ error: 'Credenziali non valide' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });

    // Genera token plugin longevo (30 giorni)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO plugin_tokens (user_id, token, name, client_type, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [user.id, token, `${client_type || 'Plugin'} - ${new Date().toLocaleDateString('it')}`, client_type || 'generic', expiresAt]
    );

    res.json({
      token,
      expires_at: expiresAt,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Middleware autenticazione via plugin token ─────────────────────────────
const pluginAuth = async (req, res, next) => {
  const token = req.headers['x-plugin-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      'SELECT pt.*, u.id as user_id, u.email, u.full_name, u.role, u.active, u.client_id, u.reseller_id FROM plugin_tokens pt JOIN users u ON pt.user_id=u.id WHERE pt.token=$1',
      [token]
    );
    if (!r.rows[0]) return res.status(401).json({ error: 'Token non valido' });
    const pt = r.rows[0];
    if (new Date(pt.expires_at) < new Date()) return res.status(401).json({ error: 'Token scaduto' });
    if (!pt.active) return res.status(401).json({ error: 'Account disabilitato' });
    // Aggiorna last_used
    await db.query('UPDATE plugin_tokens SET last_used_at=NOW() WHERE id=$1', [pt.id]);
    req.user = { id: pt.user_id, email: pt.email, full_name: pt.full_name, role: pt.role, client_id: pt.client_id, reseller_id: pt.reseller_id };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Caselle accessibili dall'utente del token plugin (admin confinato al proprio cliente).
const getPluginMailboxIds = async (db, user) => {
  if (user.role === 'superadmin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE active=true');
    return r.rows.map(r => r.id);
  }
  if (user.role === 'admin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE client_id=$1 AND active=true', [user.client_id]);
    return r.rows.map(r => r.id);
  }
  if (user.role === 'reseller') {
    const r = await db.query(`SELECT m.id FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1 AND m.active=true`, [user.reseller_id]);
    return r.rows.map(r => r.id);
  }
  const r = await db.query(
    `SELECT m.id FROM mailboxes m JOIN user_mailboxes um ON um.mailbox_id=m.id
     WHERE um.user_id=$1 AND m.active=true`,
    [user.id]
  );
  return r.rows.map(r => r.id);
};

// ── API per plugin: caselle accessibili ──────────────────────────────────
router.get('/mailboxes', pluginAuth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    let r;
    if (req.user.role === 'superadmin') {
      r = await db.query('SELECT id, email, display_name FROM mailboxes WHERE active=true ORDER BY email');
    } else if (req.user.role === 'admin') {
      r = await db.query(
        'SELECT id, email, display_name FROM mailboxes WHERE client_id=$1 AND active=true ORDER BY email',
        [req.user.client_id]
      );
    } else {
      r = await db.query(
        `SELECT m.id, m.email, m.display_name FROM mailboxes m
         JOIN user_mailboxes um ON um.mailbox_id=m.id
         WHERE um.user_id=$1 AND m.active=true ORDER BY m.email`,
        [req.user.id]
      );
    }
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API per plugin: ricerca email ─────────────────────────────────────────
router.get('/emails', pluginAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, search, from_date, to_date, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const allowedIds = await getPluginMailboxIds(db, req.user);
    if (!allowedIds.includes(Number(mailbox_id))) {
      return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    }
    const conditions = ['ae.mailbox_id=$1', 'ae.is_restored=false'];
    const params = [mailbox_id];
    let p = 2;
    if (search) { conditions.push(`(ae.subject ILIKE $${p} OR ae.sender_email ILIKE $${p})`); params.push(`%${search}%`); p++; }
    if (from_date) { conditions.push(`ae.sent_at >= $${p}`); params.push(from_date); p++; }
    if (to_date) { conditions.push(`ae.sent_at <= $${p}`); params.push(to_date); p++; }
    params.push(parseInt(limit)); params.push(parseInt(offset));

    const r = await db.query(
      `SELECT ae.id, ae.subject, ae.sender_name, ae.sender_email, ae.sent_at, ae.path, ae.has_attachments, ae.spam_score
       FROM archived_emails ae
       WHERE ${conditions.join(' AND ')}
       ORDER BY ae.sent_at DESC
       LIMIT $${p} OFFSET $${p+1}`,
      params
    );
    const count = await db.query(`SELECT COUNT(*) FROM archived_emails ae WHERE ${conditions.join(' AND ')}`, params.slice(0, -2));
    res.json({ items: r.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API per plugin: contenuto email ───────────────────────────────────────
router.get('/emails/:id', pluginAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { decompress } = require('../services/compression');
  try {
    const allowedIds = await getPluginMailboxIds(db, req.user);
    const r = await db.query(
      'SELECT id, subject, sender_name, sender_email, recipients, sent_at, path, body_html, body_text, raw, attachments FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)',
      [req.params.id, allowedIds]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Email non trovata' });
    const email = r.rows[0];
    let html = email.body_html, text = email.body_text;
    if (!html && !text && email.raw) {
      const { simpleParser } = require('mailparser');
      const raw = await decompress(email.raw);
      const parsed = await simpleParser(raw);
      html = parsed.html; text = parsed.text;
    }
    res.json({ ...email, html, text, raw: undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API per plugin: restore email (Graph/Gmail/IMAP) ──────────────────────
router.post('/emails/:id/restore', pluginAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { target_mailbox, target_folder } = req.body;
  const { decompress } = require('../services/compression');
  const { decrypt } = require('../services/crypto');
  try {
    const allowedIds = await getPluginMailboxIds(db, req.user);
    const emailR = await db.query('SELECT * FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)', [req.params.id, allowedIds]);
    if (!emailR.rows[0]?.raw) return res.status(404).json({ error: 'Email non trovata' });
    const mbR = await db.query('SELECT * FROM mailboxes WHERE email=$1 AND active=true', [target_mailbox]);
    if (!mbR.rows[0]) return res.status(404).json({ error: 'Casella non trovata o non configurata' });
    const mb = mbR.rows[0];
    // La casella di destinazione deve essere tra quelle consentite all'utente.
    if (!allowedIds.includes(mb.id)) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    const rawBuf = await decompress(emailR.rows[0].raw);
    const folder = target_folder || emailR.rows[0].path || 'INBOX';

    if (mb.oauth_provider === 'microsoft') {
      const { uploadMessage } = require('../services/graphCrawler');
      await uploadMessage(db, mb, rawBuf, folder);
    } else if (mb.oauth_provider === 'google') {
      const { uploadMessage } = require('../services/gmailCrawler');
      await uploadMessage(db, mb, rawBuf, folder);
    } else {
      const Imap = require('imap');
      await new Promise((resolve, reject) => {
        const imap = new Imap({
          user: mb.imap_user || mb.email,
          password: decrypt(mb.imap_password_encrypted),
          host: mb.imap_host, port: mb.imap_port || 993,
          tls: mb.imap_tls !== false, tlsOptions: { rejectUnauthorized: false }, connTimeout: 15000,
        });
        imap.once('ready', () => {
          imap.openBox(folder, false, (err) => {
            const append = () => imap.append(rawBuf, { mailbox: folder, flags: ['\Seen'] }, (e) => { imap.end(); e ? reject(e) : resolve(); });
            if (err) imap.addBox(folder, (e) => { if (e) { imap.end(); return reject(e); } append(); });
            else append();
          });
        });
        imap.once('error', reject);
        imap.connect();
      });
    }
    res.json({ success: true, message: `Email ripristinata in ${folder}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API per plugin: download EML ───────────────────────────────────────────
router.get('/emails/:id/eml', pluginAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { decompress } = require('../services/compression');
  try {
    const r = await db.query('SELECT id, subject, raw FROM archived_emails WHERE id=$1', [req.params.id]);
    if (!r.rows[0]?.raw) return res.status(404).json({ error: 'Email non trovata' });
    const rawBuf = await decompress(r.rows[0].raw);
    const safeName = (r.rows[0].subject || 'email').replace(/[^a-z0-9]/gi,'_').substring(0,50);
    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.eml"`);
    res.send(rawBuf);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Manifest dinamico Outlook (sostituisce MAILVAULT_URL) ──────────────────
router.get('/manifest/outlook', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  // Se APP_URL e' configurato lo usa, altrimenti rileva proto reale (reverse proxy)
  let baseUrl;
  if (process.env.APP_URL) {
    baseUrl = process.env.APP_URL;
  } else {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host  = req.headers['x-forwarded-host']  || req.headers['host'] || req.hostname;
    baseUrl = proto + '://' + host;
  }
  const manifestPath = path.join(__dirname, '../../plugins/outlook/manifest.xml');
  try {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    manifest = manifest.replace(/MAILVAULT_URL/g, baseUrl);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(manifest);
  } catch(e) { res.status(500).json({ error: 'Manifest non trovato' }); }
});

// ── Download Thunderbird XPI ───────────────────────────────────────────────
router.get('/download/thunderbird', authMiddleware, (req, res) => {
  const path = require('path');
  const xpi = path.join(__dirname, '../../plugins/thunderbird/mailhaven.xpi');
  res.download(xpi, 'mailhaven-archive.xpi', (err) => {
    if (err) res.status(404).json({ error: 'File non trovato. Ricostruire il pacchetto.' });
  });
});

router.get('/install-info', authMiddleware, (req, res) => {
  var baseUrl = process.env.APP_URL || (req.protocol + '://' + req.hostname);
  res.json({
    outlook: {
      manifest_url: baseUrl + '/api/plugin/manifest/outlook',
      steps: ['Apri Outlook', 'Ottieni componenti aggiuntivi', 'Aggiungi da URL', 'Incolla URL manifest', 'Installa e riavvia']
    },
    thunderbird: {
      xpi_url: baseUrl + '/api/plugin/download/thunderbird',
      steps: ['Scarica .xpi', 'Thunderbird - Strumenti - Componenti aggiuntivi', 'Installa da file', 'Riavvia']
    }
  });
});

module.exports = router;
module.exports.pluginAuth = pluginAuth;
