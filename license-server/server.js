// ============================================================================
// MailHaven — server di licenze (revoca a distanza). Minimale e fail-open lato
// client: serve solo a marcare come REVOCATE alcune chiavi/installazioni.
//
// Endpoint pubblico:
//   POST /verify   { installId, keyId, edition }  -> { revoked: bool }
// Endpoint admin (header  x-admin-token: $ADMIN_TOKEN ):
//   GET  /admin/revoked
//   POST /admin/revoke   { keyId? , installId? , reason? }
//   POST /admin/restore  { keyId? , installId? }
//
// Avvio:  ADMIN_TOKEN=... PORT=4999 node server.js
// ============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DATA = path.join(__dirname, 'revoked.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const load = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { revoked: [] }; } };
const save = (d) => fs.writeFileSync(DATA, JSON.stringify(d, null, 2));

const isRevoked = (d, keyId, installId) =>
  d.revoked.some((e) => (e.keyId && e.keyId === keyId) || (e.installId && e.installId === installId));

app.post('/verify', (req, res) => {
  const { installId, keyId } = req.body || {};
  res.json({ revoked: isRevoked(load(), keyId, installId) });
});

const auth = (req, res, next) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};

app.get('/admin/revoked', auth, (req, res) => res.json(load()));

app.post('/admin/revoke', auth, (req, res) => {
  const { keyId, installId, reason } = req.body || {};
  if (!keyId && !installId) return res.status(400).json({ error: 'keyId o installId richiesto' });
  const d = load();
  d.revoked.push({ keyId: keyId || null, installId: installId || null, reason: reason || '', at: new Date().toISOString() });
  save(d);
  res.json({ ok: true, count: d.revoked.length });
});

app.post('/admin/restore', auth, (req, res) => {
  const { keyId, installId } = req.body || {};
  const d = load();
  d.revoked = d.revoked.filter((e) => !((keyId && e.keyId === keyId) || (installId && e.installId === installId)));
  save(d);
  res.json({ ok: true, count: d.revoked.length });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4999;
app.listen(PORT, () => console.log('MailHaven license server in ascolto su :' + PORT));
