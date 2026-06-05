const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Setup completato = esiste un superadmin attivo E encryption_key è nelle settings
const isSetupDone = async (db) => {
  try {
    const r = await db.query(
      "SELECT value FROM settings WHERE key='setup_completed'"
    );
    return r.rows[0]?.value === 'true';
  } catch {
    return false;
  }
};

router.get('/status', async (req, res) => {
  const db = req.app.locals.db;
  const done = await isSetupDone(db);
  res.json({ setup_done: done });
});

router.get('/generate-keys', (req, res) => {
  const keys = Array.from({ length: 3 }, () => crypto.randomBytes(32).toString('hex'));
  const jwt  = crypto.randomBytes(32).toString('hex');
  res.json({ encryption_keys: keys, jwt_secret: jwt });
});

router.post('/complete', async (req, res) => {
  const db = req.app.locals.db;
  if (await isSetupDone(db)) {
    return res.status(403).json({ error: 'Setup già completato' });
  }

  const { encryption_key, jwt_secret, admin_email, admin_password, admin_name, app_url, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass } = req.body;

  if (!encryption_key || encryption_key.length !== 64 || !/^[0-9a-f]+$/i.test(encryption_key))
    return res.status(400).json({ error: 'ENCRYPTION_KEY non valida: deve essere 64 caratteri esadecimali' });
  if (!jwt_secret || jwt_secret.length < 32)
    return res.status(400).json({ error: 'JWT_SECRET non valido' });
  if (!admin_email || !admin_email.includes('@'))
    return res.status(400).json({ error: 'Email amministratore non valida' });
  if (!admin_password || admin_password.length < 8)
    return res.status(400).json({ error: 'Password troppo corta: minimo 8 caratteri' });

  try {
    // 1. Salva le chiavi nel DB (settings)
    await db.query(
      'INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
      ['encryption_key', encryption_key]
    );
    await db.query(
      'INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
      ['jwt_secret', jwt_secret]
    );

    // Applica in memoria
    process.env.ENCRYPTION_KEY = encryption_key;
    process.env.JWT_SECRET = jwt_secret;
    if (app_url) { process.env.APP_URL = app_url; process.env.OAUTH_REDIRECT_BASE_URL = app_url; }

    // 2. Tenta anche di scrivere nel .env per persistenza al riavvio
    try {
      const envPaths = [
        path.resolve('/app/host/.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../.env'),
      ];
      for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
          let content = fs.readFileSync(envPath, 'utf8');
          // Rimuove tutte le occorrenze della chiave e aggiunge il nuovo valore
          const set = (c, k, v) => {
            const cleaned = c.split('\n').filter(l => !new RegExp(`^${k}=`).test(l)).join('\n');
            return cleaned.trimEnd() + `\n${k}=${v}\n`;
          };
          content = set(content, 'ENCRYPTION_KEY', encryption_key);
          content = set(content, 'JWT_SECRET', jwt_secret);
          if (app_url) { content = set(content, 'APP_URL', app_url); content = set(content, 'OAUTH_REDIRECT_BASE_URL', app_url); }
          fs.writeFileSync(envPath, content, 'utf8');
          break;
        }
      }
    } catch(e) {
      console.log('Note: impossibile aggiornare .env automaticamente, usa le chiavi salvate nel DB');
    }

    // 3. Crea superadmin
    await db.query("DELETE FROM users WHERE email = 'admin@mailhaven.local'");
    const hash = await bcrypt.hash(admin_password, 10);
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, active)
       VALUES ($1,$2,$3,'superadmin',true)
       ON CONFLICT (email) DO UPDATE SET password_hash=$2, full_name=$3, role='superadmin', active=true`,
      [admin_email, hash, admin_name || 'Super Admin']
    );

    // 4. Branding fisso MailHaven
    await db.query(
      `UPDATE branding SET app_name='MailHaven', primary_color='#2563eb', secondary_color='#1e40af', footer_text='MailHaven — Email Archiving', updated_at=NOW()`
    );

    // 5. SMTP
    if (smtp_host) {
      const smtpSettings = { smtp_host, smtp_port: smtp_port||'587', smtp_secure: smtp_secure||'false', smtp_user: smtp_user||'', smtp_pass: smtp_pass||'' };
      for (const [key, value] of Object.entries(smtpSettings)) {
        await db.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, String(value)]);
      }
    }

    // 5b. Salva app_url nelle settings
    if (app_url) {
      await db.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', ['app_url', app_url]);
      await db.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', ['oauth_redirect_base_url', app_url]);
    }

    // 6. Marca setup come completato
    await db.query(
      "INSERT INTO settings (key,value) VALUES ('setup_completed','true') ON CONFLICT (key) DO UPDATE SET value='true'"
    );

    res.json({ success: true, message: 'Setup completato con successo!' });

    // Riavvia il processo dopo 2 secondi — Docker lo farà ripartire automaticamente
    setTimeout(() => { process.exit(0); }, 2000);

  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Errore durante il setup: ' + err.message });
  }
});

router.post('/test-smtp', async (req, res) => {
  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, to } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: smtp_host, port: parseInt(smtp_port)||587,
      secure: smtp_secure === true || smtp_secure === 'true',
      auth: smtp_user ? { user: smtp_user, pass: smtp_pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: smtp_user || 'noreply@mailhaven.local',
      to: to || smtp_user,
      subject: 'MailHaven — Test SMTP',
      text: 'Configurazione SMTP funzionante! MailHaven è pronto.',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
