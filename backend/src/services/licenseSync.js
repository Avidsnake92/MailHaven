// ============================================================================
// services/licenseSync.js — verifica ONLINE opzionale (revoca a distanza).
//
// Se è configurato un server licenze (setting `license_server_url` o env
// LICENSE_SERVER_URL), il client invia periodicamente installId + keyId e
// applica l'eventuale revoca. È FAIL-OPEN: se il server non risponde, NON
// cambia lo stato (l'app continua a funzionare). La verifica offline della
// firma resta la difesa primaria; questa aggiunge solo la revoca.
// ============================================================================
const crypto = require('crypto');
const license = require('./license');

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // ogni 6 ore
const TIMEOUT_MS = 6000;

const keyId = (key) => (key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 32) : null);

async function getCfg(db) {
  const r = await db.query("SELECT key,value FROM settings WHERE key IN ('license_server_url','license_key')");
  const m = {}; r.rows.forEach((x) => { m[x.key] = x.value; });
  const url = String(process.env.LICENSE_SERVER_URL || m.license_server_url || '').trim();
  return { url, key: m.license_key };
}
async function setS(db, k, v) { await db.query("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", [k, String(v)]); }
async function delS(db, k) { await db.query("DELETE FROM settings WHERE key=$1", [k]); }

async function syncNow(db) {
  const { url, key } = await getCfg(db);
  if (!url || !key) return { skipped: true };
  const installId = await license.getInstallationId(db);
  let edition = 'unknown';
  try { edition = (await license.getEntitlements(db)).edition; } catch {}
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, keyId: keyId(key), edition }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data && data.revoked === true) await setS(db, 'license_revoked', '1');
    else await delS(db, 'license_revoked');
    await setS(db, 'license_last_sync', Math.floor(Date.now() / 1000));
    await setS(db, 'license_sync_ok', '1');
    license.invalidate();
    return { ok: true, revoked: !!(data && data.revoked) };
  } catch (e) {
    // FAIL-OPEN: registra l'errore ma non tocca lo stato di revoca
    await setS(db, 'license_last_sync', Math.floor(Date.now() / 1000));
    await setS(db, 'license_sync_ok', '0');
    return { ok: false, error: e.message };
  }
}

let timer = null;
function start(db) {
  stop();
  setTimeout(() => syncNow(db).then((r) => { if (r && r.ok) console.log('[license-sync] ok (revoked=' + r.revoked + ')'); }).catch(() => {}), 30000);
  timer = setInterval(() => syncNow(db).catch(() => {}), SYNC_INTERVAL_MS);
  console.log('License sync started');
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, syncNow, keyId };
