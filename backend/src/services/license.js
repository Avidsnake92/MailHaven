// ============================================================================
// services/license.js — Edizioni & Feature Key (stile WatchGuard)
//
// Una "Feature Key" è una stringa firmata Ed25519 che il cliente incolla in
// Impostazioni → Licenza. Viene verificata OFFLINE con la chiave pubblica qui
// incorporata (non falsificabile né modificabile). È legata all'ID installazione.
// Senza chiave valida → edizione Community (1 azienda, 25 caselle, no MSP).
//
// Formato:  MHFK-1-<payload_base64url>.<firma_base64url>
// payload = { sn, cust, ed, feat:{...}, lim:{...}, iss, exp, grace }
// ============================================================================
const crypto = require('crypto');

// Chiave PUBBLICA di licenza MailHaven — verifica firma offline. NON è un segreto.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA66ft0iBom9U7Pn8KRc281XkS8VQiEUhpLI3Tw+3PEHI=
-----END PUBLIC KEY-----`;

// Entitlement di default (edizione Community, nessuna chiave)
const COMMUNITY = () => ({
  edition: 'community',
  customer: null,
  feat: { reseller: false, antivirus: false, antispam: false, backup: false, legal_hold: false, import: false, logs: true },
  lim: { clients: 1, mailboxes: 25, resellers: 0 },
  expires: null, graceUntil: null, status: 'community',
});

const FEATURES = ['reseller', 'antivirus', 'antispam', 'backup', 'legal_hold', 'import', 'logs'];

const b64urlToBuf = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Verifica firma + decodifica payload. Ritorna l'oggetto payload o null.
function parseFeatureKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.trim().match(/^MHFK-1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const payloadBuf = b64urlToBuf(m[1]);
    const sig = b64urlToBuf(m[2]);
    if (!crypto.verify(null, payloadBuf, LICENSE_PUBLIC_KEY, sig)) return null;
    return JSON.parse(payloadBuf.toString('utf8'));
  } catch { return null; }
}

// Trasforma il payload (già verificato) in entitlement effettivi, gestendo
// scadenza + periodo di tolleranza (grace), poi declassamento a Community.
function computeFromKey(key, installId) {
  const base = COMMUNITY();
  const data = parseFeatureKey(key);
  if (!data) return Object.assign(base, { installationId: installId });

  // Legatura all'installazione (come il serial WatchGuard)
  if (data.sn && installId && data.sn !== installId) {
    return Object.assign(base, { status: 'invalid_install', installationId: installId });
  }

  const now = Date.now();
  const exp = data.exp ? Date.parse(data.exp) : null;
  const graceDays = Number(data.grace || 0);
  const graceUntil = exp != null ? exp + graceDays * 86400000 : null;

  let status = 'active';
  let active = true;
  if (exp != null) {
    if (now <= exp) status = (exp - now <= 30 * 86400000) ? 'expiring' : 'active';
    else if (graceUntil != null && now <= graceUntil) status = 'grace';
    else { status = 'expired'; active = false; }
  }

  const graceIso = graceUntil != null ? new Date(graceUntil).toISOString() : null;

  // Scaduto oltre il grace → Community (dati intatti, ingest mai bloccato)
  if (!active) {
    return Object.assign(COMMUNITY(), {
      status: 'expired', customer: data.cust || null,
      expires: data.exp || null, graceUntil: graceIso, installationId: installId,
    });
  }

  const feat = Object.assign({}, COMMUNITY().feat);
  for (const f of FEATURES) if (data.feat && data.feat[f] != null) feat[f] = !!data.feat[f];
  const lim = Object.assign({}, COMMUNITY().lim, data.lim || {});

  return {
    edition: data.ed || 'pro', customer: data.cust || null,
    feat, lim, expires: data.exp || null, graceUntil: graceIso,
    status, installationId: installId,
  };
}

// ── ID installazione (generato una volta, salvato nelle settings) ───────────
async function getInstallationId(db) {
  const r = await db.query("SELECT value FROM settings WHERE key='installation_id'");
  if (r.rows[0] && r.rows[0].value) return r.rows[0].value;
  const id = crypto.randomUUID();
  await db.query(
    "INSERT INTO settings (key,value) VALUES ('installation_id',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
    [id]
  );
  return id;
}

// ── Entitlement correnti (con cache breve) ──────────────────────────────────
let _cache = null, _cacheAt = 0;
const CACHE_MS = 60000;

async function getEntitlements(db, force = false) {
  if (!force && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  const installId = await getInstallationId(db);
  const r = await db.query("SELECT value FROM settings WHERE key='license_key'");
  const ent = computeFromKey(r.rows[0] && r.rows[0].value, installId);
  _cache = ent; _cacheAt = Date.now();
  return ent;
}

function invalidate() { _cache = null; _cacheAt = 0; }

// Salva (dopo verifica) una nuova Feature Key. Ritorna gli entitlement.
async function saveLicenseKey(db, key) {
  const installId = await getInstallationId(db);
  const data = parseFeatureKey(key);
  if (!data) { const e = new Error('Chiave licenza non valida o firma non riconosciuta'); e.code = 'INVALID_KEY'; throw e; }
  if (data.sn && data.sn !== installId) { const e = new Error('La chiave è emessa per un altro ID installazione'); e.code = 'WRONG_INSTALL'; throw e; }
  await db.query(
    "INSERT INTO settings (key,value) VALUES ('license_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
    [String(key).trim()]
  );
  invalidate();
  return getEntitlements(db, true);
}

async function removeLicenseKey(db) {
  await db.query("DELETE FROM settings WHERE key='license_key'");
  invalidate();
  return getEntitlements(db, true);
}

const hasFeature = (ent, name) => !!(ent && ent.feat && ent.feat[name]);

// Controllo inline comodo (per route handler e scheduler)
async function feature(db, name) {
  try { return hasFeature(await getEntitlements(db), name); } catch { return false; }
}

// Middleware Express: richiede una funzione abilitata dalla licenza (edizione).
function requireFeature(name, label) {
  return async (req, res, next) => {
    try {
      const ent = await getEntitlements(req.app.locals.db);
      if (hasFeature(ent, name)) return next();
      return res.status(403).json({
        error: `Funzione non disponibile nell'edizione ${ent.edition}. Richiede una licenza che include "${label || name}".`,
        code: 'MH-1010', edition: ent.edition,
      });
    } catch (e) { return res.status(500).json({ error: 'Errore verifica licenza' }); }
  };
}

module.exports = {
  LICENSE_PUBLIC_KEY,
  getEntitlements, getInstallationId, invalidate,
  parseFeatureKey, computeFromKey,
  saveLicenseKey, removeLicenseKey,
  hasFeature, feature, requireFeature,
  COMMUNITY, FEATURES,
};
