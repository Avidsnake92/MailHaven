const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const license = require('../services/license');
const { auditMiddleware } = require('../middleware/audit');

router.use(authMiddleware);
router.use(auditMiddleware('LICENZA'));

// GET /license — stato edizione + entitlements + ID installazione + sync (superadmin)
router.get('/', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    const ent = await license.getEntitlements(db, true);
    const r = await db.query("SELECT key,value FROM settings WHERE key IN ('license_server_url','license_last_sync','license_sync_ok')");
    const m = {}; r.rows.forEach((x) => { m[x.key] = x.value; });
    ent.sync = {
      serverUrl: process.env.LICENSE_SERVER_URL || m.license_server_url || '',
      lastSync: m.license_last_sync ? parseInt(m.license_last_sync, 10) : null,
      ok: m.license_sync_ok === '1',
      envLocked: !!process.env.LICENSE_SERVER_URL,
    };
    res.json(ent);
  } catch (e) {
    res.status(500).json({ error: 'Errore lettura licenza' });
  }
});

// POST /license/server — imposta/azzera l'URL del server licenze (verifica online)
router.post('/server', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { url } = req.body || {};
  try {
    if (url && String(url).trim()) {
      await db.query("INSERT INTO settings(key,value) VALUES('license_server_url',$1) ON CONFLICT(key) DO UPDATE SET value=$1", [String(url).trim()]);
    } else {
      await db.query("DELETE FROM settings WHERE key='license_server_url'");
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Errore salvataggio URL' }); }
});

// POST /license/sync — forza una verifica online adesso
router.post('/sync', requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await require('../services/licenseSync').syncNow(db);
    const ent = await license.getEntitlements(db, true);
    res.json({ result, edition: ent.edition, status: ent.status });
  } catch (e) { res.status(500).json({ error: 'Errore sincronizzazione' }); }
});

// POST /license — attiva una Feature Key (solo superadmin)
router.post('/', requireRole('superadmin'), async (req, res) => {
  const { key } = req.body || {};
  if (!key || !String(key).trim()) return res.status(400).json({ error: 'Chiave mancante' });
  try {
    const ent = await license.saveLicenseKey(req.app.locals.db, String(key).trim());
    res.json(ent);
  } catch (e) {
    const msg = e.code === 'WRONG_INSTALL'
      ? 'La chiave è emessa per un altro ID installazione.'
      : 'Chiave licenza non valida o firma non riconosciuta.';
    res.status(400).json({ error: msg, code: 'MH-1011' });
  }
});

// DELETE /license — rimuove la chiave → torna a Community (solo superadmin)
router.delete('/', requireRole('superadmin'), async (req, res) => {
  try {
    const ent = await license.removeLicenseKey(req.app.locals.db);
    res.json(ent);
  } catch (e) {
    res.status(500).json({ error: 'Errore rimozione licenza' });
  }
});

module.exports = router;
