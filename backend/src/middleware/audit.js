// Audit middleware — registra in activity_log ogni richiesta mutante (POST/PUT/
// DELETE/PATCH) andata a buon fine (status < 400) di un utente autenticato.
// Copre automaticamente tutte le route del router su cui è montato.
const getIp = (req) => { const fwd = req.headers['x-forwarded-for']; return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress; };

const redact = (b) => {
  if (!b || typeof b !== 'object') return undefined;
  const c = { ...b };
  for (const k of ['password', 'secret_key', 'sftp_password', 'imap_password', 'token', 'access_key']) if (k in c) c[k] = '***';
  return c;
};

const verbFor = (m) => ({ POST: 'CREATO', PUT: 'MODIFICATO', PATCH: 'AGGIORNATO', DELETE: 'ELIMINATO' }[m] || m);
const NOUN = { clients: 'CLIENTE', resellers: 'RIVENDITORE', users: 'UTENTE', mailboxes: 'CASELLA' };

// scope opzionale: etichetta fissa per router senza risorsa nel path (es. 'IMPORT', 'BACKUP', 'RESTORE')
const auditMiddleware = (scope) => (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  res.on('finish', () => {
    try {
      if (res.statusCode >= 400 || !req.user || !req.user.id) return;
      if (/test-imap|smtp\/test|av\/restart-scheduler|\/test$|status\//.test(req.path)) return; // non-azioni
      const seg = req.path.split('/').filter(Boolean);
      let action;
      if (scope) {
        action = `${scope}_${verbFor(req.method)}`;
      } else if (seg.includes('sync')) action = 'CASELLA_SYNC';
      else if (seg.includes('pause')) action = 'CASELLA_PAUSA';
      else if (seg.includes('toggle')) action = 'CASELLA_ABILITA_DISABILITA';
      else if (seg[0] === 'mailboxes' && seg.includes('users')) action = 'CASELLA_ASSEGNA_UTENTI';
      else if (seg[0] === 'users' && seg.includes('mailboxes')) action = 'UTENTE_ASSEGNA_CASELLE';
      else if (seg.includes('unlock')) action = 'UTENTE_SBLOCCATO';
      else if (seg.includes('reset-2fa')) action = 'UTENTE_2FA_RESET';
      else if (seg.includes('key-rotation')) action = 'CHIAVE_RUOTATA';
      else if (seg[0] === 'settings') action = 'IMPOSTAZIONI_MODIFICATE';
      else { const noun = NOUN[seg[0]] || (seg[0] || 'ADMIN').toUpperCase(); action = `${noun}_${verbFor(req.method)}`; }

      const details = { method: req.method, path: req.path, params: req.params, body: redact(req.body) };
      req.app.locals.db.query(
        'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)',
        [req.user.id, action, JSON.stringify(details), getIp(req)]
      ).catch(() => {});
    } catch { /* l'audit non deve mai rompere la richiesta */ }
  });
  next();
};

module.exports = { auditMiddleware };
