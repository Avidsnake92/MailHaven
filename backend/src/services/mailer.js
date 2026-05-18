const nodemailer = require('nodemailer');

/**
 * Legge configurazione SMTP dal DB (unica fonte di verità)
 * db è il pool PostgreSQL — obbligatorio
 */
const getSmtpConfig = async (db) => {
  try {
    const r = await db.query(`
      SELECT key, value FROM settings
      WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_secure','smtp_from')
    `);
    const cfg = {};
    for (const row of r.rows) cfg[row.key] = row.value;
    return {
      host:   cfg.smtp_host   || '',
      port:   parseInt(cfg.smtp_port) || 587,
      user:   cfg.smtp_user   || '',
      pass:   cfg.smtp_pass   || '',
      secure: cfg.smtp_secure === 'true',
      from:   cfg.smtp_from   || cfg.smtp_user || '',
    };
  } catch { return { host: '', port: 587, user: '', pass: '', secure: false, from: '' }; }
};

/**
 * Crea trasporto nodemailer dalla config DB
 */
const getTransport = (cfg) => {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
};

/**
 * Notifica account bloccato per troppi tentativi
 */
const sendAccountBlocked = async (db, to, blockedUser, ip, maxAttempts) => {
  try {
    const cfg = await getSmtpConfig(db);
    if (!cfg.host || !cfg.user) return;
    const transport = getTransport(cfg);
    await transport.sendMail({
      from: `"MailHaven Security" <${cfg.from}>`,
      to,
      subject: '⚠️ Account bloccato per troppi tentativi falliti',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#dc2626">⚠️ Account Bloccato</h2>
          <p>L'account <strong>${blockedUser.email}</strong> è stato bloccato automaticamente dopo ${maxAttempts} tentativi di accesso falliti.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Utente</td><td style="padding:8px">${blockedUser.full_name || blockedUser.email}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Email</td><td style="padding:8px">${blockedUser.email}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">IP</td><td style="padding:8px">${ip}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Data/Ora</td><td style="padding:8px">${new Date().toLocaleString('it-IT')}</td></tr>
          </table>
          <p>Accedi al pannello di amministrazione per sbloccare l'account se si tratta di un errore legittimo.</p>
          <p style="color:#6b7280;font-size:12px">MailHaven Security System</p>
        </div>
      `,
    });
  } catch (e) { console.error('[Mailer] sendAccountBlocked error:', e.message); }
};

/**
 * Notifica accesso da IP sconosciuto
 */
const sendSuspiciousIp = async (db, to, user, newIp, knownIps) => {
  try {
    const cfg = await getSmtpConfig(db);
    if (!cfg.host || !cfg.user) return;
    const transport = getTransport(cfg);
    await transport.sendMail({
      from: `"MailHaven Security" <${cfg.from}>`,
      to,
      subject: `⚠️ Accesso da IP sconosciuto — ${user.email}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#d97706">Accesso da IP Sconosciuto</h2>
          <p>L'utente <strong>${user.email}</strong> ha effettuato l'accesso da un indirizzo IP mai visto prima.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Utente</td><td style="padding:8px">${user.full_name || user.email}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Nuovo IP</td><td style="padding:8px;color:#dc2626"><strong>${newIp}</strong></td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">IP abituali</td><td style="padding:8px">${knownIps.join(', ') || 'nessuno'}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Data/Ora</td><td style="padding:8px">${new Date().toLocaleString('it-IT')}</td></tr>
          </table>
          <p>Se questo accesso è legittimo, puoi ignorare questa notifica.</p>
          <p style="color:#6b7280;font-size:12px">MailHaven Security System</p>
        </div>
      `,
    });
  } catch (e) { console.error('[Mailer] sendSuspiciousIp error:', e.message); }
};

module.exports = { getSmtpConfig, getTransport, sendAccountBlocked, sendSuspiciousIp };
