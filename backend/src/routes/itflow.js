// ============================================================================
// routes/itflow.js — Integrazione ITFlow (sola lettura clienti)
//
// Legge i clienti da ITFlow (GET {base}/api/v1/clients/read.php?api_key=...)
// e li importa come Aziende MailHaven. Il collegamento è ricordato in
// clients.itflow_client_id → reimportare non crea doppioni.
// Solo superadmin. La API key resta lato server (mai esposta al frontend).
// ============================================================================
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);
router.use(requireRole('superadmin'));
router.use(require('../middleware/audit').auditMiddleware('ITFLOW'));

const getCfg = async (db) => {
  const r = await db.query("SELECT key, value FROM settings WHERE key IN ('itflow_url','itflow_api_key')");
  const m = {}; r.rows.forEach((x) => { m[x.key] = x.value; });
  return { url: (m.itflow_url || '').replace(/\/+$/, ''), apiKey: m.itflow_api_key || '' };
};

const itflowFetch = async (cfg, resource) => {
  const res = String(resource).replace(/[^a-z_]/g, '');
  const url = `${cfg.url}/api/v1/${res}/read.php?api_key=${encodeURIComponent(cfg.apiKey)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`ITFlow HTTP ${r.status}`);
    const j = await r.json();
    if (!j || !Array.isArray(j.data)) throw new Error('Risposta ITFlow non valida (manca data[])');
    return j.data;
  } finally { clearTimeout(t); }
};

// GET /itflow/config — stato configurazione (la key non viene mai restituita)
router.get('/config', async (req, res) => {
  const cfg = await getCfg(req.app.locals.db);
  res.json({ url: cfg.url, configured: !!(cfg.url && cfg.apiKey), api_key_set: !!cfg.apiKey });
});

// POST /itflow/config — salva URL e/o API key (key vuota = mantieni quella salvata)
router.post('/config', async (req, res) => {
  const db = req.app.locals.db;
  const { url, api_key } = req.body || {};
  if (!url || !/^https?:\/\//i.test(String(url))) {
    return res.status(400).json({ error: 'URL ITFlow non valido (es. https://itflow.k2tech.it)' });
  }
  const save = (k, v) => db.query(
    'INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, v]);
  await save('itflow_url', String(url).trim().replace(/\/+$/, ''));
  if (api_key && String(api_key).trim()) await save('itflow_api_key', String(api_key).trim());
  const cfg = await getCfg(db);
  if (!cfg.apiKey) return res.status(400).json({ error: 'API key mancante' });
  res.json({ ok: true });
});

// GET /itflow/clients — clienti ITFlow con stato importazione
router.get('/clients', async (req, res) => {
  const db = req.app.locals.db;
  const cfg = await getCfg(db);
  if (!cfg.url || !cfg.apiKey) return res.status(400).json({ error: 'ITFlow non configurato', code: 'MH-1901' });
  try {
    const data = await itflowFetch(cfg, 'clients');
    const local = await db.query('SELECT id, name, itflow_client_id FROM clients');
    const byItflowId = new Map(local.rows.filter(c => c.itflow_client_id != null)
      .map(c => [String(c.itflow_client_id), c]));
    const byName = new Map(local.rows.map(c => [String(c.name).trim().toLowerCase(), c]));

    const items = data
      .filter(c => c.client_id != null && c.client_name)
      .map(c => {
        const linked = byItflowId.get(String(c.client_id));
        const sameName = byName.get(String(c.client_name).trim().toLowerCase());
        return {
          itflow_id: parseInt(c.client_id, 10),
          name: String(c.client_name),
          type: c.client_type || null,
          imported: !!linked,
          mailhaven_client_id: linked ? linked.id : null,
          name_match: !linked && sameName ? sameName.id : null, // esiste già un'azienda omonima
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    res.json({ items, total: items.length });
  } catch (e) {
    res.status(502).json({ error: `ITFlow non raggiungibile: ${e.message}`, code: 'MH-1902' });
  }
});

// POST /itflow/import — importa/collega i clienti selezionati { ids: [itflow_id] }
router.post('/import', async (req, res) => {
  const db = req.app.locals.db;
  const cfg = await getCfg(db);
  if (!cfg.url || !cfg.apiKey) return res.status(400).json({ error: 'ITFlow non configurato', code: 'MH-1901' });
  const ids = (req.body?.ids || []).map(Number).filter(Number.isInteger);
  if (!ids.length) return res.status(400).json({ error: 'Nessun cliente selezionato' });
  try {
    const data = await itflowFetch(cfg, 'clients');
    const wanted = data.filter(c => ids.includes(parseInt(c.client_id, 10)));
    const results = { imported: 0, linked: 0, skipped: 0, details: [] };

    for (const c of wanted) {
      const itfId = parseInt(c.client_id, 10);
      const name = String(c.client_name || '').trim();
      if (!name) { results.skipped++; continue; }

      const already = await db.query('SELECT id FROM clients WHERE itflow_client_id=$1', [itfId]);
      if (already.rows.length) { results.skipped++; results.details.push({ name, action: 'già importato' }); continue; }

      // Azienda omonima già presente → collega invece di duplicare
      const same = await db.query('SELECT id FROM clients WHERE LOWER(TRIM(name))=LOWER($1) AND itflow_client_id IS NULL', [name]);
      if (same.rows.length) {
        await db.query('UPDATE clients SET itflow_client_id=$1 WHERE id=$2', [itfId, same.rows[0].id]);
        results.linked++; results.details.push({ name, action: 'collegato a esistente' });
        continue;
      }

      await db.query('INSERT INTO clients (name, itflow_client_id) VALUES ($1,$2)', [name, itfId]);
      results.imported++; results.details.push({ name, action: 'importato' });
    }
    res.json({ ok: true, ...results });
  } catch (e) {
    res.status(502).json({ error: `Import da ITFlow fallito: ${e.message}`, code: 'MH-1902' });
  }
});

module.exports = router;
