#!/usr/bin/env node
// revoke.js — gestisce la lista di revoca locale (revoked.json), senza dover
// chiamare l'API. Da eseguire sul server licenze.
//
//   node revoke.js list
//   node revoke.js add --install <installId> [--reason "..."]
//   node revoke.js add --keyId <keyId>       [--reason "..."]
//   node revoke.js remove --install <installId>
//   node revoke.js remove --keyId <keyId>
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'revoked.json');
const load = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { revoked: [] }; } };
const save = (d) => fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };

const cmd = process.argv[2];
const d = load();
if (cmd === 'list') {
  console.log(JSON.stringify(d, null, 2));
} else if (cmd === 'add') {
  const k = arg('keyId'), i = arg('install');
  if (!k && !i) { console.error('Serve --keyId o --install'); process.exit(1); }
  d.revoked.push({ keyId: k || null, installId: i || null, reason: arg('reason') || '', at: new Date().toISOString() });
  save(d); console.log('Revocata. Totale in lista:', d.revoked.length);
} else if (cmd === 'remove') {
  const k = arg('keyId'), i = arg('install');
  d.revoked = d.revoked.filter((e) => !((k && e.keyId === k) || (i && e.installId === i)));
  save(d); console.log('Ripristinata. Totale in lista:', d.revoked.length);
} else {
  console.log('Uso: node revoke.js [list | add | remove] --install <id> | --keyId <id> [--reason "..."]');
}
