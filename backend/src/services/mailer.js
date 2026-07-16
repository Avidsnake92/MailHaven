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

/**
 * Avviso agli amministratori quando un aggiornamento fallisce / scatta il rollback.
 * `info` = { outcome, fromCommit, toCommit, version, message, logTail }
 */
const sendUpdateAlert = async (db, to, info) => {
  try {
    const cfg = await getSmtpConfig(db);
    if (!cfg.host || !cfg.user) return false;
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (!recipients.length) return false;
    const transport = getTransport(cfg);
    const rolledBack = info.outcome === 'rolled_back';
    const subject = rolledBack
      ? '⚠️ MailHaven — aggiornamento fallito, ripristinata la versione precedente'
      : '🔴 MailHaven — aggiornamento fallito';
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const html = `
      <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px">
        <h2 style="color:${rolledBack ? '#b45309' : '#b91c1c'}">${rolledBack ? 'Aggiornamento fallito — rollback eseguito' : 'Aggiornamento fallito'}</h2>
        <p>${rolledBack
          ? 'Il nuovo aggiornamento non è partito correttamente. MailHaven è stato <b>riportato automaticamente alla versione precedente</b>, che è di nuovo operativa.'
          : 'L\'aggiornamento è fallito e il ripristino automatico non è riuscito. <b>È necessario un intervento manuale.</b>'}</p>
        <table style="font-size:13px;color:#374151;border-collapse:collapse">
          <tr><td style="padding:2px 10px 2px 0"><b>Esito</b></td><td>${esc(info.outcome)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Versione</b></td><td>${esc(info.version || '—')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Commit tentato</b></td><td>${esc(info.toCommit || '—')}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Ripristinato a</b></td><td>${esc(info.fromCommit || '—')}</td></tr>
        </table>
        ${info.logTail ? `<p style="margin-top:14px"><b>Ultime righe del log:</b></p><pre style="background:#f3f4f6;padding:10px;border-radius:8px;font-size:12px;overflow:auto">${esc(info.logTail)}</pre>` : ''}
      </div>`;
    await transport.sendMail({
      from: cfg.from, to: recipients.join(', '), subject,
      html,
      text: `${subject}\n\nEsito: ${info.outcome}\nVersione: ${info.version || '-'}\nCommit tentato: ${info.toCommit || '-'}\nRipristinato a: ${info.fromCommit || '-'}\n\n${info.logTail || ''}`,
    });
    return true;
  } catch (e) {
    console.error('[UpdateAlert] invio fallito:', e.message);
    return false;
  }
};

module.exports = { getSmtpConfig, getTransport, sendAccountBlocked, sendSuspiciousIp, sendUpdateAlert };
