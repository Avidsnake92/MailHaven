const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const { log } = require('../services/logger');
const { sendAccountBlocked } = require('../services/mailer');
const { generateSecret, generateQR, verifyToken } = require('../services/totp');
const { encrypt, decrypt } = require('../services/crypto');

const getIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress;
};

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // 8 ore max per sessione

// Login
router.post('/login', async (req, res) => {
  const { email, password, totp_code } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      await log(db, null, 'LOGIN_FAILED', { email, reason: 'Utente non trovato' }, ip);
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await log(db, user.id, 'LOGIN_BLOCKED', { email, reason: 'Account bloccato', remaining_minutes: remaining }, ip);
      return res.status(423).json({ 
        error: `Account bloccato. Riprova tra ${remaining} minuti o contatta l'amministratore.`,
        locked: true
      });
    }

    // Check if account is disabled
    if (!user.active) {
      return res.status(401).json({ error: 'Account disabilitato. Contatta l\'amministratore.' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const newAttempts = (user.failed_attempts || 0) + 1;
      let lockUpdate = '';
      let lockParams = [newAttempts, user.id];

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        lockUpdate = ', locked_until = $3';
        lockParams = [newAttempts, user.id, lockUntil];
        
        // Notify superadmins
        try {
          const admins = await db.query("SELECT email FROM users WHERE role = 'superadmin' AND active = true");
          for (const admin of admins.rows) {
            await sendAccountBlocked(admin.email, user, ip);
          }
        } catch (e) { console.error('Mail notification error:', e.message); }

        await log(db, user.id, 'ACCOUNT_LOCKED', { email, attempts: newAttempts, ip }, ip);
      } else {
        await log(db, user.id, 'LOGIN_FAILED', { email, attempts: newAttempts, reason: 'Password errata' }, ip);
      }

      await db.query(`UPDATE users SET failed_attempts = $1${lockUpdate} WHERE id = $2`, lockParams);

      const remaining = MAX_ATTEMPTS - newAttempts;
      return res.status(401).json({ 
        error: newAttempts >= MAX_ATTEMPTS 
          ? `Account bloccato per ${LOCK_MINUTES} minuti dopo ${MAX_ATTEMPTS} tentativi falliti.`
          : `Credenziali non valide. ${remaining > 0 ? `Ancora ${remaining} tentativ${remaining === 1 ? 'o' : 'i'} prima del blocco.` : ''}`,
        locked: newAttempts >= MAX_ATTEMPTS
      });
    }

    // Check 2FA if enabled
    if (user.totp_enabled && user.totp_secret) {
      if (!totp_code) {
        return res.status(200).json({ requires_2fa: true, message: 'Inserisci il codice 2FA' });
      }
      const secret = decrypt(user.totp_secret);
      const valid2fa = verifyToken(secret, totp_code);
      if (!valid2fa) {
        await log(db, user.id, 'LOGIN_FAILED_2FA', { email, reason: '2FA non valido' }, ip);
        return res.status(401).json({ error: 'Codice 2FA non valido', requires_2fa: true });
      }
    }

    // Reset failed attempts on success
    await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1', [user.id]);
    await log(db, user.id, 'LOGIN', { email, totp: user.totp_enabled }, ip);

    // Suspicious IP check — notifica se IP mai visto per questo utente
    try {
      const recentIps = await db.query(
        `SELECT DISTINCT ip_address FROM activity_log 
         WHERE user_id = $1 AND action = 'LOGIN' AND ip_address != $2
         AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY ip_address`,
        [user.id, ip]
      );
      const knownIps = recentIps.rows.map(r => r.ip_address);
      const isNewIp = knownIps.length > 0 && !knownIps.includes(ip);
      if (isNewIp) {
        await log(db, user.id, 'SUSPICIOUS_IP', { email, ip, known_ips: knownIps }, ip);
        // Notifica superadmin
        const { sendSuspiciousIp } = require('../services/mailer');
        const admins = await db.query("SELECT email FROM users WHERE role = 'superadmin' AND active = true");
        for (const admin of admins.rows) {
          await sendSuspiciousIp(admin.email, user, ip, knownIps).catch(() => {});
        }
      }
    } catch (e) { console.error('Suspicious IP check error:', e.message); }


    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, client_id: user.client_id, full_name: user.full_name, sessionStart: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, client_id: user.client_id }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Refresh token
router.post('/refresh', authMiddleware, async (req, res) => {
  const sessionStart = req.user.sessionStart || Date.now();
  if (Date.now() - sessionStart > SESSION_MAX_MS) {
    return res.status(401).json({ error: 'Sessione scaduta, effettua nuovamente il login.' });
  }
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, client_id: req.user.client_id, full_name: req.user.full_name, sessionStart },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ token });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT id, email, full_name, role, client_id, last_login, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password attuale non corretta' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await log(db, req.user.id, 'PASSWORD_CHANGED', { email: req.user.email }, ip);
    res.json({ message: 'Password aggiornata' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Setup 2FA - generate QR code
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    const secret = generateSecret();
    const branding = await db.query('SELECT app_name FROM branding LIMIT 1');
    const appName = branding.rows[0]?.app_name || 'MailVault';
    
    const { qrDataUrl, uri } = await generateQR(user.email, secret, appName);
    
    await db.query('UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2', 
      [encrypt(secret), req.user.id]);
    
    res.json({ qrDataUrl, secret, uri });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: 'Errore generazione 2FA' }); 
  }
});

// Verify and activate 2FA
router.post('/2fa/verify', authMiddleware, async (req, res) => {
  const { code } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    const result = await db.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user.totp_secret) return res.status(400).json({ error: 'Setup 2FA non iniziato' });
    
    const secret = decrypt(user.totp_secret);
    const valid = verifyToken(secret, code);
    if (!valid) return res.status(401).json({ error: 'Codice non valido. Riprova.' });
    
    await db.query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);
    await log(db, req.user.id, '2FA_ENABLED', { email: req.user.email }, ip);
    res.json({ message: '2FA attivato con successo' });
  } catch (err) { res.status(500).json({ error: 'Errore verifica 2FA' }); }
});

// Disable 2FA
router.post('/2fa/disable', authMiddleware, async (req, res) => {
  const { password } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password non corretta' });
    
    await db.query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user.id]);
    await log(db, req.user.id, '2FA_DISABLED', { email: req.user.email }, ip);
    res.json({ message: '2FA disattivato' });
  } catch (err) { res.status(500).json({ error: 'Errore' }); }
});

module.exports = router;
