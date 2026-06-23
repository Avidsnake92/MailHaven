const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { ERRORS, AppError } = require('../errors');
const { blacklistToken } = require('../services/jwtBlacklist');
const { validate, schemas } = require('../middleware/validate');
const { log } = require('../services/logger');
const { sendAccountBlocked } = require('../services/mailer');
const { generateSecret, generateQR, verifyToken } = require('../services/totp');
const { encrypt, decrypt } = require('../services/crypto');

// ── Multer — inizializzato una volta sola al caricamento del modulo ─────────
const uploadDir = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(uploadDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExts.includes(ext) || !allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Formato non supportato. Usa JPG, PNG o WEBP'));
    }
    cb(null, true);
  },
}).single('avatar');

const getIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress;
};

const MAX_ATTEMPTS = 10; // blocco DB dopo 10 tentativi (rate limiter blocca prima a 20)
const LOCK_MINUTES = 15;
const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // 8 ore max per sessione

// Login
router.post('/login', validate(schemas.login), async (req, res) => {
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
            await sendAccountBlocked(db, admin.email, user, ip, MAX_ATTEMPTS);
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
          await sendSuspiciousIp(db, admin.email, user, ip, knownIps).catch(() => {});
        }
      }
    } catch (e) { console.error('Suspicious IP check error:', e.message); }


    const jti = require('crypto').randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, client_id: user.client_id, reseller_id: user.reseller_id, full_name: user.full_name, sessionStart: Date.now(), jti },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Salva sessione nel DB
    try {
      const ua = req.headers['user-agent'] || '';
      await db.query(
        `INSERT INTO user_sessions (user_id, jti, ip_address, device_info, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (jti) DO NOTHING`,
        [user.id, jti, ip, JSON.stringify({ ua: ua.slice(0, 200) })]
      );
      // Pulizia sessioni scadute
      await db.query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    } catch(e) { console.error('[Sessions] Save error:', e.message); }

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
  const jti = req.user.jti || require('crypto').randomUUID();
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, client_id: req.user.client_id, reseller_id: req.user.reseller_id, full_name: req.user.full_name, sessionStart, jti },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ token });
});

// Get current user
router.get('/me', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT id, email, full_name, role, client_id, last_login, totp_enabled, timezone, language, phone, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return next(new AppError(ERRORS.MH_1101));
    res.json(result.rows[0]);
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// POST /auth/avatar — upload immagine profilo
router.post('/avatar', authMiddleware, (req, res, next) => {
  const db = req.app.locals.db;
  avatarUpload(req, res, async (err) => {
    if (err) return next(new AppError({ ...ERRORS.MH_1903, message: err.message }, err.message));
    if (!req.file) return next(new AppError(ERRORS.MH_1402, 'Nessun file caricato'));
    try {
      const old = await db.query('SELECT avatar_url FROM users WHERE id=$1', [req.user.id]);
      if (old.rows[0]?.avatar_url?.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '../../', old.rows[0].avatar_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } catch {}
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.query('UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2', [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  });
});

// DELETE /auth/avatar — rimuovi avatar
router.delete('/avatar', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query('SELECT avatar_url FROM users WHERE id=$1', [req.user.id]);
    if (r.rows[0]?.avatar_url?.startsWith('/uploads/')) {
      const fs = require('fs');
      const path = require('path');
      const p = path.join(__dirname, '../../', r.rows[0].avatar_url);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    await db.query('UPDATE users SET avatar_url=NULL, updated_at=NOW() WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// PUT /auth/avatar/preset — scegli avatar predefinito
router.put('/avatar/preset', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { preset } = req.body;
  const validPresets = ['preset_1','preset_2','preset_3','preset_4','preset_5','preset_6','preset_7','preset_8'];
  if (!validPresets.includes(preset)) return next(new AppError(ERRORS.MH_1402, 'Preset non valido'));
  try {
    const avatarUrl = `/avatars/${preset}.svg`;
    await db.query('UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2', [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// PUT /auth/profile — aggiorna profilo utente
router.put('/profile', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { full_name, timezone, language, phone } = req.body;
  try {
    if (full_name !== undefined && (typeof full_name !== 'string' || full_name.trim().length < 2)) {
      return next(new AppError(ERRORS.MH_1104, 'Il nome deve avere almeno 2 caratteri'));
    }
    const allowed_timezones = ['Europe/Rome','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Los_Angeles','Asia/Tokyo','UTC'];
    const allowed_languages = ['it','en','de','fr','es'];
    if (timezone && !allowed_timezones.includes(timezone)) return next(new AppError(ERRORS.MH_1104, 'Timezone non valida'));
    if (language && !allowed_languages.includes(language)) return next(new AppError(ERRORS.MH_1104, 'Lingua non valida'));
    await db.query(
      `UPDATE users SET full_name=COALESCE($1,full_name), timezone=COALESCE($2,timezone),
       language=COALESCE($3,language), phone=COALESCE($4,phone), updated_at=NOW() WHERE id=$5`,
      [full_name?.trim()||null, timezone||null, language||null, phone?.trim()||null, req.user.id]
    );
    const updated = await db.query(
      'SELECT id,email,full_name,role,timezone,language,phone,totp_enabled FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(updated.rows[0]);
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// GET /auth/sessions — lista sessioni attive
router.get('/sessions', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      `SELECT id, ip_address, device_info, created_at, last_seen, (jti=$2) as is_current
       FROM user_sessions WHERE user_id=$1 AND expires_at>NOW() ORDER BY last_seen DESC`,
      [req.user.id, req.user.jti||'']
    );
    res.json(r.rows);
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// DELETE /auth/sessions/:id — termina una sessione
router.delete('/sessions/:id', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query('SELECT jti FROM user_sessions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return next(new AppError(ERRORS.MH_1401));
    await blacklistToken(db, r.rows[0].jti, req.user.id, Math.floor(Date.now()/1000)+900);
    await db.query('DELETE FROM user_sessions WHERE id=$1', [req.params.id]);
    res.json({ message: 'Sessione terminata' });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// Change password
// POST /auth/logout — invalida il token corrente
router.post('/logout', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.jti && decoded?.exp) {
        await blacklistToken(db, decoded.jti, req.user.id, decoded.exp);
      }
    }
    res.json({ message: 'Logout effettuato' });
  } catch (e) { res.json({ message: 'Logout effettuato' }); }
});

router.post('/change-password', authMiddleware, validate(schemas.changePassword), async (req, res, next) => {
  const { current_password, new_password } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    if (!new_password || new_password.length < 8) return next(new AppError(ERRORS.MH_1103));
    if (new_password === current_password) return res.status(400).json({ error: 'La nuova password deve essere diversa da quella attuale', code: 'MH-1103' });
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return next(new AppError(ERRORS.MH_1001, 'password attuale errata'));
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash=$1, failed_attempts=0, locked_until=NULL WHERE id=$2', [hash, req.user.id]);
    await log(db, req.user.id, 'PASSWORD_CHANGED', { email: req.user.email }, ip);
    res.json({ message: 'Password aggiornata con successo' });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// Setup 2FA - generate QR code
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    const secret = generateSecret();
    const branding = await db.query('SELECT app_name FROM branding LIMIT 1');
    const appName = branding.rows[0]?.app_name || 'MailHaven';
    
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


// ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
// SSO Login ??? Microsoft 365 e Google
// ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const https = require('https');
const querystring = require('querystring');

const getBaseUrl = () => process.env.OAUTH_REDIRECT_BASE_URL || process.env.APP_URL || '';
const MS_REDIRECT = () => getBaseUrl() + '/api/auth/oauth/microsoft/callback';
const G_REDIRECT  = () => getBaseUrl() + '/api/auth/oauth/google/callback';
const FRONTEND_URL = () => getBaseUrl() || 'http://localhost:8080';

// Emette JWT identico al login normale
const issueJwt = async (db, user, ip) => {
  const jti = require('crypto').randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const token = require('jsonwebtoken').sign(
    { id: user.id, email: user.email, role: user.role, client_id: user.client_id, reseller_id: user.reseller_id,
      full_name: user.full_name, sessionStart: Date.now(), jti },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  await db.query(
    `INSERT INTO user_sessions (user_id, jti, ip_address, device_info, expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [user.id, jti, ip, JSON.stringify({ sso: true }), expiresAt]
  ).catch(() => {});
  await db.query('UPDATE users SET last_login=NOW(), failed_attempts=0 WHERE id=$1', [user.id]).catch(() => {});
  return token;
};

const fetchJson = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
  });
  req.on('error', reject);
  req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
});

const postForm = (url, body) => new Promise((resolve, reject) => {
  const bodyStr = querystring.stringify(body);
  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname, port: 443,
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr) },
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
  });
  req.on('error', reject);
  req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  req.write(bodyStr);
  req.end();
});


// Crea automaticamente un utente al primo login SSO (se abilitato)
const ssoAutoProvision = async (db, email, displayName, provider) => {
  const enabled = await db.query("SELECT value FROM settings WHERE key='sso_auto_provision'").catch(() => ({ rows: [] }));
  if (!enabled.rows[0] || enabled.rows[0].value !== 'true') return null;
  const randomPwd = require('crypto').randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(randomPwd, 10);
  const result = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role, active)
     VALUES ($1, $2, $3, 'user', true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, full_name, role, client_id, active, totp_enabled`,
    [email, hash, displayName || email, ]
  );
  if (result.rows[0]) {
    await log(db, result.rows[0].id, 'USER_AUTO_CREATED_SSO', { email, provider }, null).catch(() => {});
    return result.rows[0];
  }
  // Se ON CONFLICT ha bloccato l'inserimento (race condition), rileggi
  const re = await db.query('SELECT id, email, full_name, role, client_id, active, totp_enabled FROM users WHERE LOWER(email)=$1', [email]);
  return re.rows[0] || null;
};

// ?????? Microsoft SSO ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

// GET /auth/oauth/microsoft ??? avvia flusso SSO Microsoft
router.get('/oauth/microsoft', (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  if (!clientId) return res.status(503).send('Microsoft OAuth non configurato');
  const state = require('crypto').randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: MS_REDIRECT(),
    scope: 'openid profile email User.Read',
    response_mode: 'query',
    state,
  });
  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
});

// GET /auth/oauth/microsoft/callback ??? callback SSO Microsoft
router.get('/oauth/microsoft/callback', async (req, res) => {
  const { code, error } = req.query;
  const db = req.app.locals.db;
  const ip = getIp(req);
  const frontendUrl = FRONTEND_URL();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent(error || 'access_denied')}`);
  }

  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    // Scambia code con access token
    const tokens = await postForm(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: MS_REDIRECT(),
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read',
      }
    );
    if (!tokens.access_token) {
      throw new Error(tokens.error_description || 'Token non ricevuto');
    }
    // Ottieni profilo utente da Graph
    const profile = await fetchJson('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {
      Authorization: 'Bearer ' + tokens.access_token,
    });
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase().trim();
    if (!email) throw new Error('Email non disponibile dal provider');

    // Cerca utente nel DB
    const result = await db.query(
      'SELECT id, email, full_name, role, client_id, active, totp_enabled FROM users WHERE LOWER(email)=$1',
      [email]
    );
    let user = result.rows[0];
    if (!user) {
      user = await ssoAutoProvision(db, email, profile.displayName, 'microsoft');
      if (!user) {
        return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent("Utente non trovato. Contatta l'amministratore.")}`);
      }
    }
    if (!user.active) {
      return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent('Account disabilitato.')}`);
    }
    if (user.totp_enabled) {
      // SSO non bypassa 2FA: redirect con token parziale e flag 2fa
      const partial = require('jsonwebtoken').sign(
        { id: user.id, email: user.email, sso_partial: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.redirect(`${frontendUrl}/login?sso_2fa=${encodeURIComponent(partial)}`);
    }
    const token = await issueJwt(db, user, ip);
    await log(db, user.id, 'LOGIN_SSO', { provider: 'microsoft', email }, ip).catch(() => {});
    res.redirect(`${frontendUrl}/login?sso_token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('[SSO Microsoft]', err.message);
    res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent('Errore autenticazione: ' + err.message)}`);
  }
});

// ?????? Google SSO ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

// GET /auth/oauth/google ??? avvia flusso SSO Google
router.get('/oauth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).send('Google OAuth non configurato');
  const state = require('crypto').randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: G_REDIRECT(),
    scope: 'openid email profile',
    access_type: 'online',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /auth/oauth/google/callback ??? callback SSO Google
router.get('/oauth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  const db = req.app.locals.db;
  const ip = getIp(req);
  const frontendUrl = FRONTEND_URL();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent(error || 'access_denied')}`);
  }

  try {
    // Scambia code con token
    const tokens = await postForm('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: G_REDIRECT(),
      grant_type: 'authorization_code',
    });
    if (!tokens.access_token) {
      throw new Error(tokens.error_description || 'Token non ricevuto');
    }
    // Ottieni profilo
    const profile = await fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      Authorization: 'Bearer ' + tokens.access_token,
    });
    const email = (profile.email || '').toLowerCase().trim();
    if (!email) throw new Error('Email non disponibile dal provider');

    // Cerca utente nel DB
    const result = await db.query(
      'SELECT id, email, full_name, role, client_id, active, totp_enabled FROM users WHERE LOWER(email)=$1',
      [email]
    );
    let user = result.rows[0];
    if (!user) {
      user = await ssoAutoProvision(db, email, profile.name, 'google');
      if (!user) {
        return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent("Utente non trovato. Contatta l'amministratore.")}`);
      }
    }
    if (!user.active) {
      return res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent('Account disabilitato.')}`);
    }
    if (user.totp_enabled) {
      const partial = require('jsonwebtoken').sign(
        { id: user.id, email: user.email, sso_partial: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.redirect(`${frontendUrl}/login?sso_2fa=${encodeURIComponent(partial)}`);
    }
    const token = await issueJwt(db, user, ip);
    await log(db, user.id, 'LOGIN_SSO', { provider: 'google', email }, ip).catch(() => {});
    res.redirect(`${frontendUrl}/login?sso_token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('[SSO Google]', err.message);
    res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent('Errore autenticazione: ' + err.message)}`);
  }
});


// POST /auth/2fa/verify-sso ??? verifica 2FA dopo login SSO parziale
router.post('/2fa/verify-sso', async (req, res) => {
  const { partial_token, totp_code } = req.body;
  const db = req.app.locals.db;
  const ip = getIp(req);
  if (!partial_token || !totp_code) return res.status(400).json({ error: 'Parametri mancanti' });
  try {
    const decoded = require('jsonwebtoken').verify(partial_token, process.env.JWT_SECRET);
    if (!decoded.sso_partial) return res.status(401).json({ error: 'Token non valido' });
    const result = await db.query(
      'SELECT id, email, full_name, role, client_id, active, totp_enabled, totp_secret FROM users WHERE id=$1',
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Utente non trovato o disabilitato' });
    if (!user.totp_enabled || !user.totp_secret) return res.status(400).json({ error: '2FA non configurato' });
    const { decrypt } = require('../services/crypto');
    const { verifyToken: verifyTotp } = require('../services/totp');
    const secret = decrypt(user.totp_secret);
    if (!verifyTotp(secret, totp_code)) return res.status(401).json({ error: 'Codice 2FA non valido', requires_2fa: true });
    const token = await issueJwt(db, user, ip);
    await log(db, user.id, 'LOGIN_SSO_2FA', { email: user.email }, ip).catch(() => {});
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, client_id: user.client_id } });
  } catch (err) {
    res.status(401).json({ error: 'Token SSO scaduto o non valido. Riprova il login.' });
  }
});

module.exports = router;
