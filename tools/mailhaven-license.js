#!/usr/bin/env node
// ============================================================================
// mailhaven-license — emette una Feature Key MailHaven firmata (Ed25519).
// Richiede la chiave PRIVATA (private.pem), da tenere SEGRETA.
//
// Esempio:
//   node mailhaven-license.js --priv private.pem --install <ID> --edition msp \
//        --customer "Cliente SRL" --mailboxes 5000 --resellers 50 --clients 500 \
//        --expires 2027-06-29 --grace 14
// ============================================================================
const crypto = require('crypto');
const fs = require('fs');

const argv = process.argv;
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes('--' + name);

if (has('help') || argv.length <= 2) {
  console.log(`MailHaven — emissione Feature Key

Uso:
  node mailhaven-license.js --priv <private.pem> --install <ID> [opzioni]

Obbligatori:
  --priv <file>           chiave privata PEM (SEGRETA)
  --install <id>          ID installazione del cliente (da Impostazioni → Licenza)

Opzioni:
  --edition pro|msp|lifetime  edizione (default: pro)
  --lifetime              edizione "a vita": illimitata e SENZA scadenza
  --customer "<nome>"     nome cliente
  --mailboxes <n>         limite caselle      (default 1000)
  --clients <n>           limite aziende      (default 1000)
  --resellers <n>         limite rivenditori  (default: msp=50, pro=0)
  --expires <YYYY-MM-DD>  scadenza            (default: +1 anno)
  --grace <giorni>        tolleranza dopo scadenza (default 14)
  --feat a,b,c            funzioni esplicite  (default per edizione)
                          [reseller,antivirus,antispam,backup,legal_hold,import,logs]
  --unbound               NON legare all'ID installazione (chiave valida ovunque)
`);
  process.exit(0);
}

const privPath = arg('priv');
const install = arg('install');
if (!privPath) { console.error('Errore: --priv obbligatorio (chiave privata). Vedi --help.'); process.exit(1); }
if (!install && !has('unbound')) { console.error('Errore: --install obbligatorio (oppure usa --unbound). Vedi --help.'); process.exit(1); }

let priv;
try { priv = fs.readFileSync(privPath, 'utf8'); }
catch { console.error('Errore: impossibile leggere ' + privPath); process.exit(1); }

const edition = String(arg('edition', 'pro')).toLowerCase();
const lifetime = has('lifetime') || edition === 'lifetime';
const DEFAULT_FEAT = {
  pro:      { reseller: 0, antivirus: 1, antispam: 1, backup: 1, legal_hold: 1, import: 1, logs: 1 },
  msp:      { reseller: 1, antivirus: 1, antispam: 1, backup: 1, legal_hold: 1, import: 1, logs: 1 },
  lifetime: { reseller: 1, antivirus: 1, antispam: 1, backup: 1, legal_hold: 1, import: 1, logs: 1 },
};
let feat = Object.assign({}, DEFAULT_FEAT[lifetime ? 'lifetime' : edition] || DEFAULT_FEAT.pro);
if (arg('feat')) {
  feat = { reseller: 0, antivirus: 0, antispam: 0, backup: 0, legal_hold: 0, import: 0, logs: 0 };
  arg('feat').split(',').forEach((f) => { feat[f.trim()] = 1; });
}

const today = new Date().toISOString().slice(0, 10);
const defExp = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

const payload = { ed: lifetime ? 'lifetime' : edition, feat, iss: today };
if (lifetime) {
  // "A vita": nessuna scadenza, nessun limite
  payload.lim = { clients: null, mailboxes: null, resellers: null };
} else {
  payload.lim = {
    clients: parseInt(arg('clients', '1000'), 10),
    mailboxes: parseInt(arg('mailboxes', '1000'), 10),
    resellers: parseInt(arg('resellers', edition === 'msp' ? '50' : '0'), 10),
  };
  payload.exp = arg('expires', defExp);
  payload.grace = parseInt(arg('grace', '14'), 10);
}
if (!has('unbound')) payload.sn = install;
if (arg('customer')) payload.cust = arg('customer');

const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let sig;
try {
  const p = Buffer.from(JSON.stringify(payload));
  sig = crypto.sign(null, p, priv);
  var key = 'MHFK-1-' + b64u(p) + '.' + b64u(sig);
} catch (e) { console.error('Errore firma (chiave privata non valida?):', e.message); process.exit(1); }

console.error('--- Licenza emessa ---');
console.error('Cliente:    ' + (payload.cust || '-'));
console.error('Edizione:   ' + payload.ed);
console.error('Install ID: ' + (payload.sn || '(unbound)'));
const _u = (v) => (v == null ? 'illimitato' : v);
console.error('Limiti:     caselle ' + _u(payload.lim.mailboxes) + ' | aziende ' + _u(payload.lim.clients) + ' | rivenditori ' + _u(payload.lim.resellers));
console.error('Funzioni:   ' + Object.keys(feat).filter((k) => feat[k]).join(', '));
console.error('Scadenza:   ' + (payload.exp ? payload.exp + ' (grace ' + payload.grace + ' gg)' : 'nessuna (a vita)'));
console.error('Key ID:     ' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32) + '  (per la revoca)');
console.error('--- Feature Key (incolla in Impostazioni -> Licenza) ---');
console.log(key);
