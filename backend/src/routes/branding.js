const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');

// Get branding (public)
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM branding LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// Update branding (superadmin only)
router.put('/', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const db = req.app.locals.db;
  const { app_name, primary_color, secondary_color, footer_text, logo_url, favicon_url } = req.body;
  try {
    const result = await db.query(
      `UPDATE branding SET 
        app_name=$1, primary_color=$2, secondary_color=$3, 
        footer_text=$4, logo_url=$5, favicon_url=$6, updated_at=NOW()
       WHERE id=1 RETURNING *`,
      [app_name, primary_color, secondary_color, footer_text, logo_url, favicon_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
