// Audit middleware — registra in activity_log ogni richiesta mutante (POST/PUT/
// DELETE/PATCH) andata a buon fine, con una descrizione leggibile in italiano.
const getIp = (req) => { const fwd = req.headers['x-forwarded-for']; return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress; };

const redact = (b) => {
  if (!b || typeof b !== 'object') return undefined;
  const c = { ...b };
  for (const k of ['password', 'secret_key', 'sftp_password', 'imap_password', 'token', 'access_key']) if (k in c) c[k] = '***';
  return c;
};

// risorsa -> [tabella, colonna nome] per risolvere il nome del target (utile su PUT/DELETE)
const LOOKUP = { clients: ['clients', 'name'], resellers: ['resellers', 'name'], users: ['users', 'email'], mailboxes: ['mailboxes', 'email'] };
const NOUN = { clients: 'cliente', resellers: 'rivenditore', users: 'utente', mailboxes: 'casella' };
const FEM = new Set(['casella']);

// Costruisce { action, summary } leggibile dalla richiesta
const describe = (method, seg, body, target, scope) => {
  const r0 = seg[0];
  const name = (body && (body.name || body.email || body.full_name)) || target || (/^\d+$/.test(seg[1] || '') ? `#${seg[1]}` : '');
  const q = name ? ` «${name}»` : '';

  if (r0 === 'mailboxes' && seg.includes('sync')) return { action: 'CASELLA_SYNC', summary: `Avviata la sincronizzazione della casella${q}` };
  if (r0 === 'mailboxes' && seg.includes('pause')) return { action: 'CASELLA_SYNC_PAUSA', summary: `Messa in pausa/ripresa la sincronizzazione della casella${q}` };
  if (r0 === 'mailboxes' && seg.includes('toggle')) return { action: 'CASELLA_STATO', summary: `Abilitata/disabilitata la casella${q}` };
  if (r0 === 'mailboxes' && seg.includes('users')) return { action: 'CASELLA_UTENTI', summary: `Aggiornati gli utenti assegnati alla casella${q}` };
  if (r0 === 'mailboxes' && seg.includes('policy')) return { action: 'CASELLA_POLICY', summary: `Aggiornata la policy di archiviazione della casella${q}` };
  if (r0 === 'users' && seg.includes('mailboxes')) return { action: 'UTENTE_CASELLE', summary: `Aggiornate le caselle assegnate all'utente${q}` };
  if (r0 === 'users' && seg.includes('unlock')) return { action: 'UTENTE_SBLOCCATO', summary: `Sbloccato l'utente${q}` };
  if (r0 === 'users' && seg.includes('reset-2fa')) return { action: 'UTENTE_2FA_RESET', summary: `Reimpostata la 2FA dell'utente${q}` };
  if (seg.includes('key-rotation')) return { action: 'CHIAVE_RUOTATA', summary: 'Ruotata la chiave di cifratura' };
  if (r0 === 'settings') return { action: 'IMPOSTAZIONI_MODIFICATE', summary: 'Modificate le impostazioni di sistema' };

  if (scope === 'IMPORT') return { action: 'EMAIL_IMPORTATE', summary: 'Importate email in una casella' };
  if (scope === 'BACKUP') {
    if (seg.includes('config')) return { action: 'BACKUP_CONFIG', summary: 'Aggiornata la configurazione di backup' };
    if (seg.includes('run')) return { action: 'BACKUP_AVVIATO', summary: 'Avviato un backup' };
    if (seg.includes('restore')) return { action: 'BACKUP_RIPRISTINATO', summary: 'Ripristinato un backup' };
    return { action: 'BACKUP', summary: 'Operazione di backup' };
  }
  if (scope === 'RESTORE') return { action: 'EMAIL_RIPRISTINATE', summary: 'Ripristinate/esportate email' };
  if (scope === 'ANTISPAM') return { action: 'ANTISPAM', summary: 'Operazione antispam su una casella' };

  if (seg.includes('legal-hold')) return { action: 'LEGAL_HOLD', summary: 'Aggiornato il Legal Hold su delle email' };

  if (NOUN[r0]) {
    const noun = NOUN[r0];
    const fem = FEM.has(noun);
    const verb = method === 'POST' ? (fem ? 'Creata' : 'Creato')
      : method === 'DELETE' ? (fem ? 'Eliminata' : 'Eliminato')
      : (fem ? 'Modificata' : 'Modificato');
    const code = noun.toUpperCase() + '_' + (method === 'POST' ? 'CREATO' : method === 'DELETE' ? 'ELIMINATO' : 'MODIFICATO');
    return { action: code, summary: `${verb} ${noun}${q}` };
  }
  return { action: `AZIONE_${method}`, summary: `Azione ${method} su ${seg.join('/') || '/'}` };
};

const auditMiddleware = (scope) => async (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const seg = req.path.split('/').filter(Boolean);
  // pre-risolvi il nome del target (così su PUT/DELETE mostriamo il nome, non l'id)
  let target = null;
  try {
    const look = LOOKUP[seg[0]];
    if (look && /^\d+$/.test(seg[1] || '') && req.app.locals.db) {
      const r = await req.app.locals.db.query(`SELECT ${look[1]} AS v FROM ${look[0]} WHERE id=$1`, [seg[1]]);
      target = r.rows[0] ? r.rows[0].v : null;
    }
  } catch { /* ignora */ }

  res.on('finish', () => {
    try {
      if (res.statusCode >= 400 || !req.user || !req.user.id) return;
      if (/test-imap|smtp\/test|av\/restart-scheduler|\/test$|status\//.test(req.path)) return;
      const { action, summary } = describe(req.method, seg, req.body, target, scope);
      const details = { summary, target: target || undefined, body: redact(req.body), path: req.path };
      req.app.locals.db.query(
        'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)',
        [req.user.id, action, JSON.stringify(details), getIp(req)]
      ).catch(() => {});
    } catch { /* l'audit non deve mai rompere la richiesta */ }
  });
  next();
};

module.exports = { auditMiddleware };
