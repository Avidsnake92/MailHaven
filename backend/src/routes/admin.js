const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { log } = require('../services/logger');
const { ERRORS, AppError } = require('../errors');
const { validate, schemas } = require('../middleware/validate');
const { auditMiddleware } = require('../middleware/audit');

// Validazione password
const validatePassword = (password) => {
  if (!password || password.length < 8) return 'La password deve essere di almeno 8 caratteri'
  if (!/[A-Z]/.test(password)) return 'La password deve contenere almeno una lettera maiuscola'
  if (!/[0-9]/.test(password)) return 'La password deve contenere almeno un numero'
  if (!/[^A-Za-z0-9]/.test(password)) return 'La password deve contenere almeno un carattere speciale'
  return null
}


const getIp = (req) => { const fwd = req.headers['x-forwarded-for']; return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress; };

// ── Scoping multi-tenant ───────────────────────────────────────
// Il superadmin ha accesso pieno; un 'admin' è confinato al proprio client_id.
const isSuper = (req) => req.user.role === 'superadmin';

// Verifica l'accesso a una risorsa data la coppia { client_id, reseller_id } del
// cliente proprietario. superadmin: tutto; reseller: solo i propri clienti; admin:
// solo il proprio client_id.
const canAccessClientRow = (req, row) => {
  if (isSuper(req)) return true;
  if (req.user.role === 'reseller') return row.reseller_id != null && row.reseller_id === req.user.reseller_id;
  return row.client_id != null && row.client_id === req.user.client_id;
};

// Verifica che la casella esista e sia accessibile al chiamante.
// Scrive direttamente la risposta d'errore e ritorna null se non autorizzato.
const checkMailbox = async (db, req, res, mailboxId) => {
  const r = await db.query(
    'SELECT m.client_id, c.reseller_id FROM mailboxes m LEFT JOIN clients c ON c.id=m.client_id WHERE m.id=$1',
    [mailboxId]
  );
  if (!r.rows.length) { res.status(404).json({ error: 'Casella non trovata', code: 'MH-1201' }); return null; }
  if (!canAccessClientRow(req, r.rows[0])) { res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' }); return null; }
  return r.rows[0];
};

// Verifica che l'utente target esista e sia accessibile al chiamante.
const checkUser = async (db, req, res, userId) => {
  const r = await db.query(
    'SELECT u.client_id, u.role, c.reseller_id FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.id=$1',
    [userId]
  );
  if (!r.rows.length) { res.status(404).json({ error: 'Utente non trovato', code: 'MH-1101' }); return null; }
  if (!canAccessClientRow(req, r.rows[0])) { res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' }); return null; }
  return r.rows[0];
};

// client_id effettivo per la creazione di risorse.
// admin: forzato al proprio; reseller/superadmin: quello richiesto (validato a parte).
const scopedClientId = (req, requested) => {
  if (req.user.role === 'admin') return req.user.client_id;
  return requested ?? null;
};

// Verifica che il client_id richiesto sia gestibile dal chiamante (per le creazioni).
const checkClientAccess = async (db, req, res, clientId) => {
  if (isSuper(req)) return true;
  if (!clientId) { res.status(400).json({ error: 'Cliente obbligatorio', code: 'MH-1108' }); return false; }
  const c = (await db.query('SELECT reseller_id FROM clients WHERE id=$1', [clientId])).rows[0];
  if (!c) { res.status(404).json({ error: 'Cliente non trovato', code: 'MH-1108' }); return false; }
  if (!canAccessClientRow(req, { client_id: Number(clientId), reseller_id: c.reseller_id })) {
    res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' }); return false;
  }
  return true;
};

// Normalizza un valore quota dal body: '' / null / non-numerico → null (illimitato).
const normLimit = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

// Controllo limiti cliente PRIMA di creare nuove risorse (caselle/utenti).
// Filosofia MSP: non si blocca MAI l'ingest delle email; si blocca solo il
// provisioning di nuove risorse quando il cliente è oltre i limiti.
// Ritorna una stringa-errore se va bloccato, altrimenti null.
const checkClientLimits = async (db, clientId, { addMailbox = false, addUser = false } = {}) => {
  if (!clientId) return null; // risorse senza cliente: nessun limite
  const c = (await db.query('SELECT quota_bytes, max_mailboxes, max_users, reseller_id FROM clients WHERE id=$1', [clientId])).rows[0];
  if (!c) return null;
  if (addMailbox && c.max_mailboxes != null) {
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM mailboxes WHERE client_id=$1', [clientId])).rows[0].n;
    if (n >= c.max_mailboxes) return `Limite caselle del cliente raggiunto (${c.max_mailboxes}).`;
  }
  if (addUser && c.max_users != null) {
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM users WHERE client_id=$1', [clientId])).rows[0].n;
    if (n >= c.max_users) return `Limite utenti del cliente raggiunto (${c.max_users}).`;
  }
  if ((addMailbox || addUser) && c.quota_bytes != null) {
    const used = (await db.query(
      `SELECT COALESCE(SUM(ae.compressed_size_bytes),0)::bigint AS used
       FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id WHERE m.client_id=$1`, [clientId]
    )).rows[0].used;
    if (BigInt(used) >= BigInt(c.quota_bytes)) {
      return 'Quota di spazio del cliente superata: impossibile aggiungere nuove risorse (l\'archiviazione delle caselle esistenti continua comunque).';
    }
  }
  // 2° livello: se il cliente appartiene a un reseller, verifica anche il suo pacchetto.
  if (c.reseller_id != null) {
    const rerr = await checkResellerLimits(db, c.reseller_id, { addMailbox, addUser });
    if (rerr) return rerr;
  }
  return null;
};

// Controllo del pacchetto complessivo del reseller (somma su tutti i suoi clienti).
const checkResellerLimits = async (db, resellerId, { addMailbox = false, addUser = false } = {}) => {
  const rs = (await db.query('SELECT quota_bytes, max_mailboxes, max_users FROM resellers WHERE id=$1', [resellerId])).rows[0];
  if (!rs) return null;
  if (addMailbox && rs.max_mailboxes != null) {
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1', [resellerId])).rows[0].n;
    if (n >= rs.max_mailboxes) return `Limite caselle del pacchetto reseller raggiunto (${rs.max_mailboxes}).`;
  }
  if (addUser && rs.max_users != null) {
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM users u JOIN clients c ON c.id=u.client_id WHERE c.reseller_id=$1', [resellerId])).rows[0].n;
    if (n >= rs.max_users) return `Limite utenti del pacchetto reseller raggiunto (${rs.max_users}).`;
  }
  if ((addMailbox || addUser) && rs.quota_bytes != null) {
    const used = (await db.query(
      `SELECT COALESCE(SUM(ae.compressed_size_bytes),0)::bigint AS used
       FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1`, [resellerId]
    )).rows[0].used;
    if (BigInt(used) >= BigInt(rs.quota_bytes)) return 'Quota di spazio del pacchetto reseller superata: impossibile aggiungere nuove risorse (archiviazione attiva).';
  }
  return null;
};

// Controllo allocazione: la somma delle sotto-quote dei clienti del reseller non
// può superare il pacchetto venduto. Ritorna stringa-errore o null.
const checkResellerAllocation = async (db, resellerId, clientId, next) => {
  if (resellerId == null) return null;
  const rs = (await db.query('SELECT quota_bytes, max_mailboxes, max_users FROM resellers WHERE id=$1', [resellerId])).rows[0];
  if (!rs) return null;
  const o = (await db.query(
    `SELECT COALESCE(SUM(quota_bytes),0)::bigint AS q, COALESCE(SUM(max_mailboxes),0)::int AS mb, COALESCE(SUM(max_users),0)::int AS us
     FROM clients WHERE reseller_id=$1 AND id <> $2`, [resellerId, clientId || 0]
  )).rows[0];
  if (rs.quota_bytes != null && next.quota_bytes != null && BigInt(o.q) + BigInt(next.quota_bytes) > BigInt(rs.quota_bytes))
    return 'Allocazione spazio oltre il pacchetto reseller.';
  if (rs.max_mailboxes != null && next.max_mailboxes != null && o.mb + next.max_mailboxes > rs.max_mailboxes)
    return 'Allocazione caselle oltre il pacchetto reseller.';
  if (rs.max_users != null && next.max_users != null && o.us + next.max_users > rs.max_users)
    return 'Allocazione utenti oltre il pacchetto reseller.';
  return null;
};

router.use(authMiddleware);
router.use(requireRole('admin', 'superadmin', 'reseller'));
// Il reseller può accedere SOLO alle route dati con scoping; tutto il resto
// (log, impostazioni, backup, statistiche di sistema) è negato di default.
const RESELLER_ALLOW = [/^\/clients/, /^\/users/, /^\/mailboxes/, /^\/storage\/clients/, /^\/storage\/mailboxes/, /^\/sync-status/, /^\/logs/, /^\/av-logs/, /^\/av-stats/];
router.use((req, res, next) => {
  if (req.user.role !== 'reseller') return next();
  if (RESELLER_ALLOW.some(re => re.test(req.path))) return next();
  return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
});
// Audit: registra ogni azione mutante andata a buon fine
router.use(auditMiddleware());

// Verifica che il reseller abbia la feature attiva (col = nome colonna feat_*).
// Scrive 403 e ritorna false se off. Per admin/superadmin ritorna true.
const resellerFeatOk = async (db, req, res, col) => {
  if (req.user.role !== 'reseller') return true;
  const f = (await db.query(`SELECT ${col} FROM resellers WHERE id=$1`, [req.user.reseller_id])).rows[0];
  if (!f || !f[col]) { res.status(403).json({ error: 'Funzione non abilitata per questo rivenditore', code: 'MH-1003' }); return false; }
  return true;
};

// ---- CLIENTS ----
router.get('/clients', async (req, res) => {
  const db = req.app.locals.db;
  try {
    let q = 'SELECT c.*, r.name AS reseller_name FROM clients c LEFT JOIN resellers r ON r.id = c.reseller_id', params = [];
    if (req.user.role === 'reseller') { q += ' WHERE c.reseller_id=$1'; params = [req.user.reseller_id]; }
    else if (req.user.role === 'admin') { q += ' WHERE c.id=$1'; params = [req.user.client_id]; }
    q += ' ORDER BY c.name';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/clients', requireRole('superadmin', 'reseller'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, quota_bytes, max_mailboxes, max_users, reseller_id } = req.body;
  try {
    // Limite aziende dell'edizione (Community = 1)
    const _ent = await require('../services/license').getEntitlements(db);
    if (_ent.lim.clients != null) {
      const _n = (await db.query('SELECT COUNT(*)::int AS n FROM clients')).rows[0].n;
      if (_n >= _ent.lim.clients) return res.status(403).json({ error: `Limite aziende dell'edizione ${_ent.edition} raggiunto (${_ent.lim.clients}). Aggiorna la licenza per gestirne di più.`, code: 'MH-1010' });
    }
    // Il reseller crea solo aziende proprie; il superadmin può assegnarle a un reseller.
    const ownerResellerId = req.user.role === 'reseller' ? req.user.reseller_id : (reseller_id ?? null);
    const ql = normLimit(quota_bytes), mb = normLimit(max_mailboxes), us = normLimit(max_users);
    if (ownerResellerId != null) {
      const allocErr = await checkResellerAllocation(db, ownerResellerId, null, { quota_bytes: ql, max_mailboxes: mb, max_users: us });
      if (allocErr) return res.status(409).json({ error: allocErr, code: 'MH-1110' });
    }
    const result = await db.query(
      'INSERT INTO clients (name, company, quota_bytes, max_mailboxes, max_users, reseller_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, company, ql, mb, us, ownerResellerId]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.put('/clients/:id', requireRole('superadmin', 'reseller'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, active, quota_bytes, max_mailboxes, max_users, reseller_id } = req.body;
  try {
    const existing = (await db.query('SELECT reseller_id FROM clients WHERE id=$1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Cliente non trovato', code: 'MH-1108' });
    if (req.user.role === 'reseller' && existing.reseller_id !== req.user.reseller_id) {
      return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    }
    // reseller: resta suo; superadmin: può riassegnare (se passa reseller_id), altrimenti invariato.
    const ownerResellerId = req.user.role === 'reseller'
      ? req.user.reseller_id
      : (reseller_id !== undefined ? (reseller_id ?? null) : existing.reseller_id);
    const ql = normLimit(quota_bytes), mb = normLimit(max_mailboxes), us = normLimit(max_users);
    if (ownerResellerId != null) {
      const allocErr = await checkResellerAllocation(db, ownerResellerId, req.params.id, { quota_bytes: ql, max_mailboxes: mb, max_users: us });
      if (allocErr) return res.status(409).json({ error: allocErr, code: 'MH-1110' });
    }
    const result = await db.query(
      `UPDATE clients SET name=$1, company=$2, active=$3,
         quota_bytes=$4, max_mailboxes=$5, max_users=$6, reseller_id=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, company, active !== undefined ? active : true, ql, mb, us, ownerResellerId, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/clients/:id', requireRole('superadmin', 'reseller'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (req.user.role === 'reseller') {
      const owned = (await db.query('SELECT reseller_id FROM clients WHERE id=$1', [req.params.id])).rows[0];
      if (!owned) return res.status(404).json({ error: 'Cliente non trovato', code: 'MH-1108' });
      if (owned.reseller_id !== req.user.reseller_id) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    }
    await db.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ message: 'Cliente eliminato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- RESELLERS (solo superadmin) ----
router.get('/resellers', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM clients c WHERE c.reseller_id=r.id) AS client_count,
        (SELECT COUNT(*) FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=r.id) AS mailbox_count,
        (SELECT COUNT(*) FROM users u JOIN clients c ON c.id=u.client_id WHERE c.reseller_id=r.id) AS user_count,
        (SELECT COALESCE(SUM(ae.compressed_size_bytes),0) FROM archived_emails ae
           JOIN mailboxes m ON m.id=ae.mailbox_id JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=r.id) AS used_bytes
      FROM resellers r ORDER BY r.name`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/resellers', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, quota_bytes, max_mailboxes, max_users, feat_legal_hold, feat_import, feat_logs, feat_backup, feat_antivirus, feat_antispam } = req.body;
  try {
    // La gestione rivenditori (MSP) richiede una licenza che la includa
    const _ent = await require('../services/license').getEntitlements(db);
    if (!_ent.feat.reseller) return res.status(403).json({ error: `L'edizione ${_ent.edition} non include la gestione rivenditori (MSP). Richiede una licenza MSP.`, code: 'MH-1010' });
    if (_ent.lim.resellers != null) {
      const _n = (await db.query('SELECT COUNT(*)::int AS n FROM resellers')).rows[0].n;
      if (_n >= _ent.lim.resellers) return res.status(403).json({ error: `Limite rivenditori della licenza raggiunto (${_ent.lim.resellers}).`, code: 'MH-1010' });
    }
    const r = await db.query(
      `INSERT INTO resellers (name, company, quota_bytes, max_mailboxes, max_users, feat_legal_hold, feat_import, feat_logs, feat_backup, feat_antivirus, feat_antispam)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, company, normLimit(quota_bytes), normLimit(max_mailboxes), normLimit(max_users),
       !!feat_legal_hold, !!feat_import, !!feat_logs, !!feat_backup, !!feat_antivirus, !!feat_antispam]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.put('/resellers/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, active, quota_bytes, max_mailboxes, max_users, feat_legal_hold, feat_import, feat_logs, feat_backup, feat_antivirus, feat_antispam } = req.body;
  try {
    const r = await db.query(
      `UPDATE resellers SET name=$1, company=$2, active=$3,
         quota_bytes=$4, max_mailboxes=$5, max_users=$6,
         feat_legal_hold=$7, feat_import=$8, feat_logs=$9, feat_backup=$10,
         feat_antivirus=$11, feat_antispam=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, company, active !== undefined ? active : true,
       normLimit(quota_bytes), normLimit(max_mailboxes), normLimit(max_users),
       !!feat_legal_hold, !!feat_import, !!feat_logs, !!feat_backup, !!feat_antivirus, !!feat_antispam, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/resellers/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM resellers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Reseller eliminato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- USERS ----
router.get('/users', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const cols = `u.id, u.email, u.full_name, u.role, u.active, u.last_login, u.client_id, c.name as client_name, c.company as client_company`;
    let result;
    if (req.user.role === 'superadmin') {
      result = await db.query(`SELECT ${cols} FROM users u LEFT JOIN clients c ON u.client_id = c.id ORDER BY u.created_at DESC`);
    } else if (req.user.role === 'reseller') {
      result = await db.query(
        `SELECT ${cols} FROM users u JOIN clients c ON u.client_id = c.id
         WHERE c.reseller_id = $1 ORDER BY u.created_at DESC`,
        [req.user.reseller_id]
      );
    } else {
      result = await db.query(
        `SELECT ${cols} FROM users u LEFT JOIN clients c ON u.client_id = c.id
         WHERE u.client_id = $1 ORDER BY u.created_at DESC`,
        [req.user.client_id]
      );
    }
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/users', validate(schemas.createUser), async (req, res, next) => {
  const db = req.app.locals.db;
  const { email, password, full_name, role, client_id } = req.body;
  // Un admin crea solo 'user'; un reseller crea 'user' o 'admin' (mai reseller/superadmin).
  if (req.user.role === 'admin' && role !== 'user') {
    return next(new AppError(ERRORS.MH_1004));
  }
  if (req.user.role === 'reseller' && !['user', 'admin'].includes(role)) {
    return next(new AppError(ERRORS.MH_1004));
  }
  try {
    const pwdError = validatePassword(password)
    if (pwdError) return next(new AppError(ERRORS.MH_1103, pwdError));
    const hash = await bcrypt.hash(password, 10);
    // Un admin può creare utenti solo nel proprio cliente; il reseller solo nei propri.
    const ownerClientId = scopedClientId(req, client_id);
    if (!(await checkClientAccess(db, req, res, ownerClientId))) return;
    const limitErr = await checkClientLimits(db, ownerClientId, { addUser: true });
    if (limitErr) return res.status(409).json({ error: limitErr, code: 'MH-1109' });
    // Solo il superadmin può creare un utente di tipo 'reseller' (collegato a un pacchetto).
    const effectiveResellerId = (isSuper(req) && role === 'reseller') ? (req.body.reseller_id ?? null) : null;
    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, client_id, reseller_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, full_name, role, client_id',
      [email, hash, full_name, role, ownerClientId, effectiveResellerId]
    );
    const newUser = result.rows[0];

    // Invia email di benvenuto (non bloccante)
    const { getSmtpConfig, getTransport } = require('../services/mailer');
    getSmtpConfig(db).then(cfg => {
      if (!cfg.host || !cfg.user) return;
      const transport = getTransport(cfg);
      transport.sendMail({
        from: `"MailHaven" <${cfg.from}>`,
        to: email,
        subject: '👋 Benvenuto in MailHaven',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#2563eb">Benvenuto in MailHaven!</h2>
            <p>Ciao ${full_name || email},</p>
            <p>Il tuo account è stato creato con successo. Ecco le tue credenziali di accesso:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:4px 0"><strong>Email:</strong> ${email}</p>
              <p style="margin:4px 0"><strong>Password:</strong> (quella impostata dall'amministratore)</p>
            </div>
            <p style="color:#dc2626;font-size:13px">⚠️ Ti consigliamo di cambiare la password al primo accesso dalla sezione Sicurezza.</p>
            <p style="color:#6b7280;font-size:12px">MailHaven — Email Archive System</p>
          </div>
        `,
      }).catch(e => console.error('[Admin] Welcome email error:', e.message));
    }).catch(() => {});

    res.json(newUser);
  } catch (err) {
    if (err.code === '23505') return next(new AppError(ERRORS.MH_1102));
    next(new AppError(ERRORS.MH_1903, err.message));
  }
});

router.put('/users/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { full_name, role, active, client_id, password } = req.body;
  try {
    const target = await checkUser(db, req, res, req.params.id);
    if (!target) return;
    // admin: solo 'user', cliente invariato. reseller: 'user'/'admin', cliente invariato.
    // superadmin: tutto come richiesto.
    let effectiveRole = role;
    let effectiveClientId = scopedClientId(req, client_id);
    if (req.user.role === 'admin') {
      if (role && role !== 'user') return res.status(403).json({ error: 'Permessi insufficienti', code: 'MH-1004' });
      effectiveRole = 'user';
      effectiveClientId = target.client_id;
    } else if (req.user.role === 'reseller') {
      if (role && !['user', 'admin'].includes(role)) return res.status(403).json({ error: 'Permessi insufficienti', code: 'MH-1004' });
      effectiveRole = role && ['user', 'admin'].includes(role) ? role : target.role;
      effectiveClientId = target.client_id;
    }
    if (password) {
      const pwdError = validatePassword(password)
      if (pwdError) return res.status(400).json({ error: pwdError })
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE users SET full_name=$1, role=$2, active=$3, client_id=$4, password_hash=$5, updated_at=NOW() WHERE id=$6',
        [full_name, effectiveRole, active, effectiveClientId, hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET full_name=$1, role=$2, active=$3, client_id=$4, updated_at=NOW() WHERE id=$5',
        [full_name, effectiveRole, active, effectiveClientId, req.params.id]
      );
    }
    res.json({ message: 'Utente aggiornato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.delete('/users/:id', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Utente eliminato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Test IMAP connection natively
router.post('/mailboxes/test-imap', async (req, res) => {
  const { imap_host, imap_port, imap_user, imap_password, imap_tls, email } = req.body;
  const Imap = require('imap');
  const host = imap_host || `mail.${email?.split('@')[1]}`;
  try {
    await new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imap_user || email, password: imap_password,
        host, port: imap_port || 993, tls: imap_tls !== false,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15000, authTimeout: 10000,
      });
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', (err) => reject(err));
      imap.connect();
    });
    res.json({ success: true, message: 'Connessione IMAP riuscita!' });
  } catch (err) {
    res.status(400).json({ success: false, error: `Connessione fallita: ${err.message}` });
  }
});

router.get('/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  try {
    let filter = '', params = [];
    if (req.user.role === 'reseller') { filter = 'WHERE c.reseller_id = $1'; params = [req.user.reseller_id]; }
    else if (!isSuper(req)) { filter = 'WHERE m.client_id = $1'; params = [req.user.client_id]; }
    const result = await db.query(
      `SELECT m.id, m.client_id, m.email, m.display_name,
              m.imap_host, m.imap_port, m.imap_tls, m.imap_user, m.active,
              CASE WHEN m.imap_password_encrypted IS NOT NULL THEN true ELSE false END as has_password,
              m.sync_paused, m.oauth_provider, m.oauth_refresh_expires_at,
              c.name as client_name,
              (SELECT COUNT(*) FROM archived_emails ae WHERE ae.mailbox_id = m.id) as email_count
       FROM mailboxes m LEFT JOIN clients c ON m.client_id = c.id ${filter} ORDER BY m.email`,
      params
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  const { client_id, email, display_name, imap_host, imap_port, imap_tls, imap_user, imap_password } = req.body;
  const { encrypt } = require('../services/crypto');
  const ip = getIp(req);
  try {
    const ownerClientId = scopedClientId(req, client_id);
    if (!(await checkClientAccess(db, req, res, ownerClientId))) return;
    // Limite caselle dell'edizione (Community = 25)
    const _ent = await require('../services/license').getEntitlements(db);
    if (_ent.lim.mailboxes != null) {
      const _n = (await db.query('SELECT COUNT(*)::int AS n FROM mailboxes')).rows[0].n;
      if (_n >= _ent.lim.mailboxes) return res.status(403).json({ error: `Limite caselle dell'edizione ${_ent.edition} raggiunto (${_ent.lim.mailboxes}). Aggiorna la licenza per aggiungerne altre.`, code: 'MH-1010' });
    }
    const limitErr = await checkClientLimits(db, ownerClientId, { addMailbox: true });
    if (limitErr) return res.status(409).json({ error: limitErr, code: 'MH-1206' });
    const result = await db.query(
      `INSERT INTO mailboxes (client_id, email, display_name, imap_host, imap_port, imap_tls, imap_user, imap_password_encrypted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, display_name, client_id`,
      [ownerClientId, email, display_name,
       imap_host || `mail.${email.split('@')[1]}`,
       imap_port || 993, imap_tls !== false,
       imap_user || email,
       imap_password ? encrypt(imap_password) : null]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

// POST /admin/mailboxes/bulk — creazione IN BLOCCO di caselle sotto un cliente.
// items: [{ email, password?, imap_host?, imap_port?, imap_tls?, imap_user?, display_name? }]
// Salta le caselle già esistenti, rispetta i limiti di licenza e del cliente.
router.post('/mailboxes/bulk', async (req, res) => {
  const db = req.app.locals.db;
  const { client_id, items } = req.body || {};
  const { encrypt } = require('../services/crypto');
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nessuna casella da importare' });
  try {
    const ownerClientId = scopedClientId(req, client_id);
    if (!(await checkClientAccess(db, req, res, ownerClientId))) return;

    // Quante caselle possiamo ancora creare secondo l'edizione
    const ent = await require('../services/license').getEntitlements(db);
    let remaining = Number.POSITIVE_INFINITY;
    if (ent.lim.mailboxes != null) {
      const n = (await db.query('SELECT COUNT(*)::int AS n FROM mailboxes')).rows[0].n;
      remaining = Math.max(0, ent.lim.mailboxes - n);
    }

    const created = [], skipped = [], failed = [];
    for (const raw of items) {
      const email = String(raw?.email || '').trim().toLowerCase();
      try {
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          failed.push({ email: raw?.email || '(vuoto)', error: 'Indirizzo non valido' }); continue;
        }
        const exists = (await db.query('SELECT id FROM mailboxes WHERE lower(email)=$1', [email])).rows[0];
        if (exists) { skipped.push({ email, reason: 'già presente' }); continue; }
        if (created.length >= remaining) {
          failed.push({ email, error: `Limite caselle dell'edizione ${ent.edition} raggiunto` }); continue;
        }
        const limitErr = await checkClientLimits(db, ownerClientId, { addMailbox: true });
        if (limitErr) { failed.push({ email, error: limitErr }); continue; }

        const domain = email.split('@')[1];
        await db.query(
          `INSERT INTO mailboxes (client_id, email, display_name, imap_host, imap_port, imap_tls, imap_user, imap_password_encrypted)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ownerClientId, email, raw.display_name || null,
           (raw.imap_host && String(raw.imap_host).trim()) || `mail.${domain}`,
           parseInt(raw.imap_port) || 993,
           raw.imap_tls !== false,
           (raw.imap_user && String(raw.imap_user).trim()) || email,
           raw.password ? encrypt(String(raw.password)) : null]
        );
        created.push(email);
      } catch (e) { failed.push({ email: email || '(?)', error: e.message }); }
    }
    res.json({ created: created.length, skipped: skipped.length, failedCount: failed.length, failed: failed.slice(0, 50), skippedList: skipped.slice(0, 50) });
  } catch (err) { console.error('[bulk mailboxes]', err.message); res.status(500).json({ error: 'Errore server' }); }
});

router.put('/mailboxes/:id', async (req, res, next) => {
  const db = req.app.locals.db;
  const { client_id, email, display_name, active, imap_host, imap_port, imap_tls, imap_user, imap_password } = req.body;
  const { encrypt } = require('../services/crypto');
  try {
    const owned = await checkMailbox(db, req, res, req.params.id);
    if (!owned) return;
    // Un admin non può riassegnare la casella ad un altro cliente.
    const ownerClientId = isSuper(req) ? scopedClientId(req, client_id) : owned.client_id;
    if (imap_password) {
      await db.query(
        `UPDATE mailboxes SET client_id=$1, email=$2, display_name=$3,
         active=$4, imap_host=$5, imap_port=$6, imap_tls=$7, imap_user=$8, imap_password_encrypted=$9 WHERE id=$10`,
        [ownerClientId, email, display_name, active !== undefined ? active : true,
         imap_host, imap_port || 993, imap_tls !== false, imap_user || email, encrypt(imap_password), req.params.id]
      );
    } else {
      await db.query(
        `UPDATE mailboxes SET client_id=$1, email=$2, display_name=$3,
         active=$4, imap_host=$5, imap_port=$6, imap_tls=$7, imap_user=$8 WHERE id=$9`,
        [ownerClientId, email, display_name, active !== undefined ? active : true,
         imap_host, imap_port || 993, imap_tls !== false, imap_user || email, req.params.id]
      );
    }
    res.json({ message: 'Casella aggiornata' });
  } catch (err) { next(new AppError(ERRORS.MH_1203, err.message)); }
});

// PATCH /admin/mailboxes/:id/toggle — abilita/disabilita casella
router.patch('/mailboxes/:id/toggle', async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const r = await db.query('SELECT id, active FROM mailboxes WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return next(new AppError(ERRORS.MH_1201));
    const newActive = !r.rows[0].active;
    await db.query('UPDATE mailboxes SET active=$1 WHERE id=$2', [newActive, req.params.id]);
    res.json({ active: newActive, message: newActive ? 'Casella abilitata' : 'Casella disabilitata' });
  } catch (err) { next(new AppError(ERRORS.MH_1203, err.message)); }
});

router.delete('/mailboxes/:id', async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const exists = await db.query('SELECT id, email FROM mailboxes WHERE id=$1', [req.params.id]);
    if (!exists.rows.length) throw new AppError(ERRORS.MH_1201);
    // Check legal hold
    const held = await db.query('SELECT id FROM archived_emails WHERE mailbox_id=$1 AND legal_hold=true LIMIT 1', [req.params.id]);
    if (held.rows.length > 0) return res.status(409).json({ error: 'Casella contiene email in Legal Hold. Rimuovi il Legal Hold prima di eliminare.' });
    // Mark as deleting immediately so UI can show progress
    await db.query("UPDATE mailboxes SET status='deleting' WHERE id=$1", [req.params.id]);
    res.status(202).json({ message: 'Eliminazione in corso', async: true });
    // Eliminazione in background, a batch e SENZA statement_timeout: caselle molto
    // grandi (decine di migliaia di email) altrimenti superano i 30s e falliscono.
    const mbId = req.params.id;
    setImmediate(async () => {
      const client = await db.connect();
      try {
        await client.query('SET statement_timeout = 0');
        await client.query('DELETE FROM spam_cache WHERE mailbox_id=$1', [mbId]);
        // Cancella le email a blocchi di 2000 per non tenere lock lunghissimi
        let removed;
        do {
          const r = await client.query(
            'DELETE FROM archived_emails WHERE ctid IN (SELECT ctid FROM archived_emails WHERE mailbox_id=$1 LIMIT 2000)',
            [mbId]
          );
          removed = r.rowCount;
        } while (removed > 0);
        await client.query('DELETE FROM mailboxes WHERE id=$1', [mbId]);
        console.log('[delete-mailbox]', exists.rows[0].email, 'eliminata');
      } catch (e) {
        console.error('[delete-mailbox] errore:', e.message);
        try { await db.query("UPDATE mailboxes SET status='error_deleting' WHERE id=$1", [mbId]); } catch {}
      } finally {
        client.release();
      }
    });
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(ERRORS.MH_1203, err.message));
  }
});

// Sync now for a specific mailbox
router.post('/mailboxes/:id/sync', async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const r = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });
    res.json({ message: 'Sincronizzazione avviata' });
    const mailbox = r.rows[0];
    setImmediate(async () => {
      try {
        let n;
        if (mailbox.oauth_provider === 'microsoft') {
          const { syncMailbox: graphSync } = require('../services/graphCrawler');
          n = await graphSync(mailbox, db);
        } else if (mailbox.oauth_provider === 'google') {
          const { syncMailbox: gmailSync } = require('../services/gmailCrawler');
          n = await gmailSync(mailbox, db);
        } else {
          const { syncMailbox } = require('../services/imapCrawler');
          n = await syncMailbox(mailbox, db);
        }
      } catch (e) { console.error('Sync error:', e.message); }
    });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Sync status
router.post('/mailboxes/:id/pause', async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const { paused } = req.body;
    await db.query('UPDATE mailboxes SET sync_paused=$1 WHERE id=$2', [paused, req.params.id]);
    res.json({ success: true, sync_paused: paused });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sync-status', async (req, res) => {
  const db = req.app.locals.db;
  try {
    let filter = '', params = [];
    if (req.user.role === 'reseller') { filter = 'JOIN clients c ON c.id = m.client_id WHERE c.reseller_id = $1'; params = [req.user.reseller_id]; }
    else if (!isSuper(req)) { filter = 'WHERE m.client_id = $1'; params = [req.user.client_id]; }
    const r = await db.query(
      `SELECT sl.*, m.email as mailbox_email FROM sync_log sl
       JOIN mailboxes m ON m.id = sl.mailbox_id
       ${filter}
       ORDER BY sl.started_at DESC LIMIT 50`,
      params
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /admin/mailboxes/:id/sync-status — storico sync per casella specifica
router.get('/mailboxes/:id/sync-status', async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const r = await db.query(
      `SELECT sl.*, m.email as mailbox_email
       FROM sync_log sl
       JOIN mailboxes m ON m.id = sl.mailbox_id
       WHERE sl.mailbox_id = $1
       ORDER BY sl.started_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Assign mailboxes to user
router.post('/users/:userId/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_ids } = req.body;
  try {
    if (!(await checkUser(db, req, res, req.params.userId))) return;
    // Un admin può assegnare solo caselle del proprio cliente.
    for (const mid of (mailbox_ids || [])) {
      if (!(await checkMailbox(db, req, res, mid))) return;
    }
    await db.query('DELETE FROM user_mailboxes WHERE user_id = $1', [req.params.userId]);
    for (const mid of (mailbox_ids || [])) {
      await db.query('INSERT INTO user_mailboxes (user_id, mailbox_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.userId, mid]);
    }
    res.json({ message: 'Caselle assegnate' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /admin/mailboxes/:id/users — utenti assegnati a una casella
router.get('/mailboxes/:id/users', async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const r = await db.query(
      'SELECT user_id FROM user_mailboxes WHERE mailbox_id=$1',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// POST /admin/mailboxes/:id/users — assegna utenti a una casella
router.post('/mailboxes/:id/users', async (req, res) => {
  const db = req.app.locals.db;
  const { user_ids } = req.body;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    // Un admin può assegnare solo utenti del proprio cliente.
    for (const uid of (user_ids || [])) {
      if (!(await checkUser(db, req, res, uid))) return;
    }
    await db.query('DELETE FROM user_mailboxes WHERE mailbox_id=$1', [req.params.id]);
    for (const uid of (user_ids || [])) {
      await db.query(
        'INSERT INTO user_mailboxes (user_id, mailbox_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [uid, req.params.id]
      );
    }
    res.json({ message: 'Utenti assegnati' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});


// ═══════════════════════════════════════════════════════════════
// STORAGE STATS
// ═══════════════════════════════════════════════════════════════

// GET /admin/storage/clients — spazio per ogni cliente (superadmin e admin)
router.get('/storage/clients', async (req, res) => {
  const db = req.app.locals.db;
  const { user } = req;
  try {
    let query, params = [];
    if (user.role === 'superadmin') {
      // Tutti i clienti
      query = `
        SELECT c.id, c.name, c.company,
          c.quota_bytes, c.max_mailboxes, c.max_users,
          (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) as user_count,
          COUNT(DISTINCT m.id) as mailbox_count,
          COUNT(ae.id) as email_count,
          COALESCE(SUM(ae.size_bytes), 0) as original_bytes,
          COALESCE(SUM(ae.compressed_size_bytes), 0) as compressed_bytes
        FROM clients c
        LEFT JOIN mailboxes m ON m.client_id = c.id
        LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
        GROUP BY c.id, c.name, c.company, c.quota_bytes, c.max_mailboxes, c.max_users
        ORDER BY compressed_bytes DESC`;
    } else if (user.role === 'reseller') {
      // Tutti i clienti del reseller
      query = `
        SELECT c.id, c.name, c.company,
          c.quota_bytes, c.max_mailboxes, c.max_users,
          (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) as user_count,
          COUNT(DISTINCT m.id) as mailbox_count,
          COUNT(ae.id) as email_count,
          COALESCE(SUM(ae.size_bytes), 0) as original_bytes,
          COALESCE(SUM(ae.compressed_size_bytes), 0) as compressed_bytes
        FROM clients c
        LEFT JOIN mailboxes m ON m.client_id = c.id
        LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
        WHERE c.reseller_id = $1
        GROUP BY c.id, c.name, c.company, c.quota_bytes, c.max_mailboxes, c.max_users
        ORDER BY compressed_bytes DESC`;
      params = [user.reseller_id];
    } else {
      // Solo il cliente dell'admin
      query = `
        SELECT c.id, c.name, c.company,
          c.quota_bytes, c.max_mailboxes, c.max_users,
          (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) as user_count,
          COUNT(DISTINCT m.id) as mailbox_count,
          COUNT(ae.id) as email_count,
          COALESCE(SUM(ae.size_bytes), 0) as original_bytes,
          COALESCE(SUM(ae.compressed_size_bytes), 0) as compressed_bytes
        FROM clients c
        LEFT JOIN mailboxes m ON m.client_id = c.id
        LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
        WHERE c.id = $1
        GROUP BY c.id, c.name, c.company, c.quota_bytes, c.max_mailboxes, c.max_users`;
      params = [user.client_id];
    }
    const r = await db.query(query, params);
    res.json(r.rows.map(row => {
      const compressed = parseInt(row.compressed_bytes || 0);
      const quotaBytes = row.quota_bytes != null ? parseInt(row.quota_bytes) : null;
      return {
        id: row.id,
        name: row.name,
        company: row.company,
        mailboxCount: parseInt(row.mailbox_count || 0),
        userCount: parseInt(row.user_count || 0),
        emailCount: parseInt(row.email_count || 0),
        originalBytes: parseInt(row.original_bytes || 0),
        compressedBytes: compressed,
        savedBytes: parseInt(row.original_bytes || 0) - compressed,
        compressionRatio: parseInt(row.original_bytes) > 0
          ? Math.round(((parseInt(row.original_bytes) - compressed) / parseInt(row.original_bytes)) * 100)
          : 0,
        // Quote MSP (null = illimitato)
        quotaBytes,
        maxMailboxes: row.max_mailboxes != null ? parseInt(row.max_mailboxes) : null,
        maxUsers: row.max_users != null ? parseInt(row.max_users) : null,
        usagePercent: quotaBytes && quotaBytes > 0 ? Math.round((compressed / quotaBytes) * 100) : null,
        overQuota: quotaBytes != null && compressed >= quotaBytes,
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/storage/mailboxes — spazio per casella (con filtro client_id)
router.get('/storage/mailboxes', async (req, res) => {
  const db = req.app.locals.db;
  const { user } = req;
  const { client_id } = req.query;
  try {
    let filter = '';
    let params = [];
    if (user.role === 'superadmin') {
      if (client_id) { filter = 'WHERE m.client_id=$1'; params = [client_id]; }
    } else if (user.role === 'admin') {
      filter = 'WHERE m.client_id=$1'; params = [user.client_id];
    } else {
      // Utente normale — solo le sue caselle
      filter = `WHERE m.id IN (SELECT mailbox_id FROM user_mailboxes WHERE user_id=$1)`;
      params = [user.id];
    }

    const r = await db.query(`
      SELECT m.id, m.email, m.display_name, c.name as client_name,
        COUNT(ae.id) as email_count,
        COALESCE(SUM(ae.size_bytes), 0) as original_bytes,
        COALESCE(SUM(ae.compressed_size_bytes), 0) as compressed_bytes
      FROM mailboxes m
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
      ${filter}
      GROUP BY m.id, m.email, m.display_name, c.name
      ORDER BY compressed_bytes DESC
    `, params);

    res.json(r.rows.map(row => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      clientName: row.client_name,
      emailCount: parseInt(row.email_count || 0),
      originalBytes: parseInt(row.original_bytes || 0),
      compressedBytes: parseInt(row.compressed_bytes || 0),
      savedBytes: parseInt(row.original_bytes || 0) - parseInt(row.compressed_bytes || 0),
      compressionRatio: parseInt(row.original_bytes) > 0
        ? Math.round(((parseInt(row.original_bytes) - parseInt(row.compressed_bytes)) / parseInt(row.original_bytes)) * 100)
        : 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/storage/vm — spazio VM (solo superadmin)
router.get('/storage/vm', requireRole('superadmin'), async (req, res) => {
  const { execSync } = require('child_process');
  try {
    // Spazio disco VM
    const dfOut = execSync("df -B1 / 2>/dev/null || df /").toString();
    const lines = dfOut.trim().split('\n');
    const parts = lines[1].trim().split(/\s+/);
    const totalBytes = parseInt(parts[1]);
    const usedBytes = parseInt(parts[2]);
    const availBytes = parseInt(parts[3]);
    const usedPercent = parseInt(parts[4]);

    // Spazio usato da Docker (cartella dati PostgreSQL)
    let dbBytes = 0;
    try {
      const duOut = execSync("du -sb /var/lib/docker/volumes/ 2>/dev/null || echo '0'").toString();
      dbBytes = parseInt(duOut.split('\t')[0]) || 0;
    } catch(e) {}

    res.json({
      vm: { totalBytes, usedBytes, availBytes, usedPercent },
      docker: { dbBytes },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/key-rotation — ruota la chiave di cifratura (solo superadmin)
router.post('/key-rotation', authMiddleware, requireRole('superadmin'), async (req, res, next) => {
  const db = req.app.locals.db;
  const { password } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (!password) return next(new AppError(ERRORS.MH_1001, 'Password obbligatoria'));
  try {
    // Verifica password superadmin
    const userR = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(password, userR.rows[0].password_hash);
    if (!valid) return next(new AppError(ERRORS.MH_1001, 'Password non corretta'));

    const { encrypt, decrypt } = require('../services/crypto');
    const crypto = require('crypto');

    // Genera nuova chiave
    const newKeyHex = crypto.randomBytes(32).toString('hex');
    const oldKeyHex = process.env.ENCRYPTION_KEY;

    // Re-cifra tutte le password IMAP con la nuova chiave
    const mailboxes = await db.query('SELECT id, imap_password_encrypted FROM mailboxes WHERE imap_password_encrypted IS NOT NULL');
    let reencrypted = 0;
    for (const m of mailboxes.rows) {
      try {
        const plain = decrypt(m.imap_password_encrypted);
        if (!plain) continue;
        // Cifra con nuova chiave temporaneamente
        const oldKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = newKeyHex;
        const newEncrypted = encrypt(plain);
        process.env.ENCRYPTION_KEY = oldKey;
        await db.query('UPDATE mailboxes SET imap_password_encrypted=$1 WHERE id=$2', [newEncrypted, m.id]);
        reencrypted++;
      } catch(e) { console.error(`[KeyRotation] Error re-encrypting mailbox ${m.id}:`, e.message); }
    }

    // Salva nuova chiave nel DB e nel processo
    await db.query(`INSERT INTO settings (key, value) VALUES ('encryption_key', $1)
      ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [newKeyHex]);
    process.env.ENCRYPTION_KEY = newKeyHex;

    // Log rotazione
    await db.query('INSERT INTO key_rotation_log (performed_by, ip_address) VALUES ($1, $2)', [req.user.id, ip]);

    res.json({
      message: `Chiave ruotata con successo. ${reencrypted} caselle re-cifrate.`,
      rotated_at: new Date().toISOString(),
    });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// ---- ACTIVITY LOG ----
router.get('/logs', async (req, res) => {
  const db = req.app.locals.db;
  if (!(await resellerFeatOk(db, req, res, 'feat_logs'))) return;
  const { page = 1, limit = 50, user_id, action } = req.query;
  const offset = (page - 1) * limit;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    // Scoping: admin/reseller vedono solo l'attività dei propri utenti.
    if (req.user.role === 'reseller') { params.push(req.user.reseller_id); where += ` AND l.user_id IN (SELECT u2.id FROM users u2 JOIN clients c2 ON c2.id=u2.client_id WHERE c2.reseller_id=$${params.length})`; }
    else if (req.user.role === 'admin') { params.push(req.user.client_id); where += ` AND l.user_id IN (SELECT u2.id FROM users u2 WHERE u2.client_id=$${params.length})`; }
    if (user_id) { params.push(user_id); where += ` AND l.user_id = $${params.length}`; }
    if (action) { params.push(`%${action}%`); where += ` AND l.action ILIKE $${params.length}`; }

    params.push(limit); params.push(offset);
    const result = await db.query(
      `SELECT l.id, l.action, l.details, l.ip_address, l.created_at,
              u.email as user_email, u.full_name as user_name, u.role as user_role
       FROM activity_log l
       LEFT JOIN users u ON l.user_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const count = await db.query(`SELECT COUNT(*) FROM activity_log l ${where}`, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(count.rows[0].count / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// ---- ACCOUNT MANAGEMENT ----
// Unlock a locked account
router.post('/users/:id/unlock', requireRole('superadmin', 'admin'), async (req, res) => {
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    if (!(await checkUser(db, req, res, req.params.id))) return;
    const result = await db.query('SELECT email, full_name FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Utente non trovato' });

    await db.query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Account sbloccato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Reset 2FA for a user (admin only)
router.post('/users/:id/reset-2fa', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const ip = getIp(req);
  try {
    await db.query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: '2FA resettato' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- AV LOG ----
router.get('/av-logs', require('../services/license').requireFeature('antivirus', 'Antivirus'), async (req, res) => {
  const db = req.app.locals.db;
  if (!(await resellerFeatOk(db, req, res, 'feat_antivirus'))) return;
  const { page = 1, limit = 50, status } = req.query;
  const offset = (page - 1) * limit;
  try {
    // Condizioni con indicizzazione parametri configurabile (lista parte da $3, count da $1).
    const build = (start) => {
      const conds = [], p = [];
      if (status) { p.push(status); conds.push(`a.status = $${start + p.length - 1}`); }
      if (req.user.role === 'reseller') { p.push(req.user.reseller_id); conds.push(`a.email_id IN (SELECT ae.id::text FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$${start + p.length - 1})`); }
      else if (req.user.role === 'admin') { p.push(req.user.client_id); conds.push(`a.email_id IN (SELECT ae.id::text FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id WHERE m.client_id=$${start + p.length - 1})`); }
      return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', p };
    };
    const list = build(3), cnt = build(1);
    const result = await db.query(
      `SELECT a.*, u.email as user_email, u.full_name as user_name
       FROM av_log a LEFT JOIN users u ON a.scanned_by = u.id
       ${list.where} ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset, ...list.p]
    );
    const count = await db.query(`SELECT COUNT(*) FROM av_log a ${cnt.where}`, cnt.p);
    res.json({ logs: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), totalPages: Math.ceil(count.rows[0].count / limit) });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// DELETE /admin/av/email/:id — elimina DEFINITIVAMENTE un'email infetta dal log AV.
// Scoping per ruolo, salta il Legal Hold.
router.delete('/av/email/:id', require('../services/license').requireFeature('antivirus', 'Antivirus'), async (req, res) => {
  const db = req.app.locals.db;
  if (!(await resellerFeatOk(db, req, res, 'feat_antivirus'))) return;
  try {
    const e = (await db.query('SELECT mailbox_id, legal_hold FROM archived_emails WHERE id=$1', [req.params.id])).rows[0];
    if (!e) return res.status(404).json({ error: 'Email non trovata' });
    // Verifica che l'email sia nell'ambito dell'utente (superadmin: tutte)
    if (req.user.role === 'admin') {
      const ok = (await db.query('SELECT 1 FROM mailboxes WHERE id=$1 AND client_id=$2', [e.mailbox_id, req.user.client_id])).rows[0];
      if (!ok) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    } else if (req.user.role === 'reseller') {
      const ok = (await db.query('SELECT 1 FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE m.id=$1 AND c.reseller_id=$2', [e.mailbox_id, req.user.reseller_id])).rows[0];
      if (!ok) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    } else if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    }
    if (e.legal_hold) return res.status(409).json({ error: 'Email in Legal Hold: rimuovi il blocco prima di eliminarla.' });
    await db.query('DELETE FROM av_log WHERE email_id=$1', [String(req.params.id)]);
    await db.query('DELETE FROM spam_cache WHERE email_id=$1', [String(req.params.id)]);
    await db.query('DELETE FROM archived_emails WHERE id=$1', [req.params.id]);
    res.json({ message: 'Email eliminata definitivamente' });
  } catch (err) { res.status(500).json({ error: err.message || 'Errore eliminazione' }); }
});

// ---- SETTINGS ----
router.get('/settings', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT key, value FROM settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

router.post('/settings', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.query(
        'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, String(value)]
      );
    }
    res.json({ message: 'Impostazioni salvate' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// ---- AV UPDATE ----
router.post('/av/update', requireRole('superadmin'), require('../services/license').requireFeature('antivirus', 'Antivirus'), async (req, res) => {
  const { exec } = require('child_process');
  exec('freshclam --quiet 2>&1', (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: 'Errore aggiornamento ClamAV: ' + (stderr || err.message) });
    res.json({ message: 'Database ClamAV aggiornato con successo' });
  });
});

// ---- SMTP TEST ----
router.post('/smtp/test', requireRole('superadmin'), async (req, res) => {
  const nodemailer = require('nodemailer');
  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host: smtp_host, port: parseInt(smtp_port) || 465,
      secure: smtp_secure === true || smtp_secure === 'true',
      auth: smtp_user ? { user: smtp_user, pass: smtp_pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: smtp_user || 'noreply@mailhaven.local',
      to: smtp_user,
      subject: 'MailHaven — Test SMTP',
      text: 'Configurazione SMTP funzionante!',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Riavvia scheduler AV dopo salvataggio impostazioni
router.post('/av/restart-scheduler', requireRole('superadmin'), require('../services/license').requireFeature('antivirus', 'Antivirus'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const avScheduler = require('../services/avScheduler');
    avScheduler.stop();
    await avScheduler.start(db);
    res.json({ message: 'Scheduler AV riavviato' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ARCHIVING POLICY ──
router.get('/mailboxes/:id/policy', async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await checkMailbox(db, req, res, req.params.id))) return;
    const result = await db.query(
      'SELECT archive_policy FROM mailboxes WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Casella non trovata' });
    res.json(result.rows[0].archive_policy || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/mailboxes/:id/policy', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query(
      'UPDATE mailboxes SET archive_policy = $1 WHERE id = $2',
      [JSON.stringify(req.body), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STATISTICHE ──
router.get('/stats/overview', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const user = req.user;
  try {
    const isSuperadmin = user.role === 'superadmin';
    const params = isSuperadmin ? [] : [user.client_id];
    const clientWhere = isSuperadmin ? '' : 'WHERE m.client_id = $1';
    const clientWhereAe = isSuperadmin ? '' : 'WHERE m.client_id = $1';

    const [totals, byMailbox, timeline, spamStats] = await Promise.all([
      db.query(`
        SELECT 
          COUNT(DISTINCT m.id) as mailbox_count,
          COUNT(ae.id) as email_count,
          COALESCE(SUM(ae.size_bytes), 0) as total_size,
          COUNT(CASE WHEN ae.sent_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days,
          COUNT(CASE WHEN ae.sent_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
        FROM mailboxes m
        LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
        ${clientWhere}
      `, params),

      db.query(`
        SELECT 
          m.id, m.email, m.display_name,
          COUNT(ae.id) as email_count,
          COALESCE(SUM(ae.size_bytes), 0) as total_size,
          MAX(ae.sent_at) as last_sync,
          COUNT(CASE WHEN ae.sent_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
        FROM mailboxes m
        LEFT JOIN archived_emails ae ON ae.mailbox_id = m.id
        ${clientWhere}
        GROUP BY m.id, m.email, m.display_name
        ORDER BY email_count DESC
      `, params),

      db.query(`
        SELECT 
          TO_CHAR(ae.sent_at, 'YYYY-MM-DD') as date,
          m.email as mailbox,
          COUNT(*) as count
        FROM archived_emails ae
        JOIN mailboxes m ON ae.mailbox_id = m.id
        ${isSuperadmin ? 'WHERE' : 'WHERE m.client_id = $1 AND'} ae.sent_at > NOW() - INTERVAL '90 days'
        GROUP BY TO_CHAR(ae.sent_at, 'YYYY-MM-DD'), m.email
        ORDER BY date ASC
      `, params),

      db.query(`
        SELECT 
          m.email,
          COUNT(sc.email_id) as spam_count
        FROM mailboxes m
        LEFT JOIN spam_cache sc ON sc.mailbox_id = m.id
        ${clientWhere}
        GROUP BY m.email
        ORDER BY spam_count DESC
      `, params),
    ]);

    res.json({
      totals: totals.rows[0],
      byMailbox: byMailbox.rows,
      timeline: timeline.rows,
      spamStats: spamStats.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ---- AV STATISTICS ----
router.get('/av-stats', require('../services/license').requireFeature('antivirus', 'Antivirus'), async (req, res) => {
  const db = req.app.locals.db;
  if (!(await resellerFeatOk(db, req, res, 'feat_antivirus'))) return;
  try {
    // Scoping per ruolo: filtri su archived_emails (ae) e su av_log (via email_id)
    let aeWhere = '', aeAnd = '', logScope = '', p = [];
    if (req.user.role === 'reseller') {
      p = [req.user.reseller_id];
      const sub = `(SELECT m.id FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1)`;
      aeWhere = `WHERE mailbox_id IN ${sub}`; aeAnd = `AND mailbox_id IN ${sub}`;
      logScope = `AND a.email_id IN (SELECT ae.id::text FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1)`;
    } else if (req.user.role === 'admin') {
      p = [req.user.client_id];
      const sub = `(SELECT id FROM mailboxes WHERE client_id=$1)`;
      aeWhere = `WHERE mailbox_id IN ${sub}`; aeAnd = `AND mailbox_id IN ${sub}`;
      logScope = `AND a.email_id IN (SELECT ae.id::text FROM archived_emails ae JOIN mailboxes m ON m.id=ae.mailbox_id WHERE m.client_id=$1)`;
    }
    const [totals, byStatus, recent, topViruses] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE av_status IS NOT NULL) as scanned,
          COUNT(*) FILTER (WHERE av_status = 'infected') as infected,
          COUNT(*) FILTER (WHERE av_status = 'clean') as clean,
          COUNT(*) FILTER (WHERE has_attachments = true AND av_status IS NULL) as pending
        FROM archived_emails ${aeWhere}`, p),
      db.query(`
        SELECT av_status, COUNT(*) as count
        FROM archived_emails WHERE av_status IS NOT NULL ${aeAnd}
        GROUP BY av_status`, p),
      db.query(`
        SELECT a.email_id, a.filename, a.status, a.viruses, a.created_at,
               ae.subject, ae.sender_email, m.email as mailbox_email
        FROM av_log a
        JOIN archived_emails ae ON ae.id::text = a.email_id::text
        JOIN mailboxes m ON m.id = ae.mailbox_id
        WHERE a.status = 'infected' ${logScope}
        ORDER BY a.created_at DESC LIMIT 10`, p),
      db.query(`
        SELECT unnest(viruses) as virus, COUNT(*) as count
        FROM av_log a WHERE status = 'infected' ${logScope}
        GROUP BY virus ORDER BY count DESC LIMIT 10`, p),
    ]);
    res.json({
      totals: totals.rows[0],
      byStatus: byStatus.rows,
      recentInfected: recent.rows,
      topViruses: topViruses.rows,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
