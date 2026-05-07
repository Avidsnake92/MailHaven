const nodemailer = require('nodemailer');

// Legge config SMTP dal DB (priorità) o dal .env (fallback)
const getSmtpConfig = async (db) => {
  if (db) {
    try {
      const result = await db.query("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
      const s = {};
      result.rows.forEach(r => s[r.key] = r.value);
      if (s.smtp_host) return {
        host: s.smtp_host,
        port: parseInt(s.smtp_port) || 587,
        secure: s.smtp_secure === 'true',
        user: s.smtp_user,
        pass: s.smtp_pass,
      };
    } catch {}
  }
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
};

const getTransport = (cfg) => {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false }
  });
};

const sendAccountBlocked = async (to, blockedUser, ip, db) => {
  const cfg = await getSmtpConfig(db);
  if (!cfg.host) return;
  const transport = getTransport(cfg);
  await transport.sendMail({
    from: `"MailHaven Security" <${cfg.user}>`,
    to,
    subject: '⚠️ Account bloccato per troppi tentativi falliti',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#dc2626">⚠️ Account Bloccato</h2>
        <p>L'account <strong>${blockedUser.email}</strong> è stato bloccato automaticamente dopo 5 tentativi di accesso falliti.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Utente</td><td style="padding:8px">${blockedUser.full_name || blockedUser.email}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Email</td><td style="padding:8px">${blockedUser.email}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">IP</td><td style="padding:8px">${ip}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Data/Ora</td><td style="padding:8px">${new Date().toLocaleString('it-IT')}</td></tr>
        </table>
        <p>Accedi al pannello di amministrazione per sbloccare l'account se si tratta di un errore legittimo.</p>
        <p style="color:#6b7280;font-size:12px">MailHaven Security System</p>
      </div>
    `
  });
};

module.exports = { sendAccountBlocked, getSmtpConfig, getTransport };
