const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const license = require('../services/license');
const { auditMiddleware } = require('../middleware/audit');

router.use(authMiddleware);
router.use(auditMiddleware('LICENZA'));

// GET /license — stato edizione + entitlements + ID installazione (solo superadmin)
router.get('/', requireRole('superadmin'), async (req, res) => {
  try {
    const ent = await license.getEntitlements(req.app.locals.db, true);
    res.json(ent);
  } catch (e) {
    res.status(500).json({ error: 'Errore lettura licenza' });
  }
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
