const nodemailer = require('nodemailer');

const getTransport = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false }
  });
};

const sendAccountBlocked = async (to, blockedUser, ip) => {
  if (!process.env.SMTP_HOST) return;
  const transport = getTransport();
  await transport.sendMail({
    from: `"MailVault Security" <${process.env.SMTP_USER}>`,
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
        <p style="color:#6b7280;font-size:12px">MailVault Security System</p>
      </div>
    `
  });
};


const sendSuspiciousIp = async (to, user, newIp, knownIps) => {
  const cfg = await getSmtpConfig();
  if (!cfg.host) return;
  const transport = getTransport(cfg);
  await transport.sendMail({
    from: `"MailHaven Security" <${cfg.user}>`,
    to,
    subject: '\u26a0\ufe0f Accesso da IP sconosciuto — ' + user.email,
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
    `
  });
};

module.exports = { sendAccountBlocked, sendSuspiciousIp, getSmtpConfig, getTransport };
