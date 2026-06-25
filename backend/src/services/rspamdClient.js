// Client per Rspamd — secondo motore antispam indipendente di MailHaven.
// Invia la raw dell'email all'endpoint /checkv2 e ritorna punteggio, azione e simboli.
const http = require('http');

const RSPAMD_URL = process.env.RSPAMD_URL || 'http://mailhaven-rspamd:11333';

// Ritorna { score, action, required, symbols: [..] } oppure lancia in caso di errore.
const checkSpam = (rawBuffer) => new Promise((resolve, reject) => {
  let u;
  try { u = new URL(RSPAMD_URL.replace(/\/$/, '') + '/checkv2'); } catch (e) { return reject(e); }
  const req = http.request({
    hostname: u.hostname,
    port: u.port || 11333,
    path: u.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': rawBuffer.length },
    timeout: 15000,
  }, (res) => {
    let b = '';
    res.on('data', (c) => b += c);
    res.on('end', () => {
      if (res.statusCode !== 200) return reject(new Error('rspamd HTTP ' + res.statusCode));
      try {
        const j = JSON.parse(b);
        resolve({
          score: typeof j.score === 'number' ? j.score : null,
          action: j.action || null,
          required: j.required_score ?? null,
          symbols: j.symbols ? Object.keys(j.symbols) : [],
        });
      } catch (e) { reject(e); }
    });
  });
  req.on('timeout', () => req.destroy(new Error('rspamd timeout')));
  req.on('error', reject);
  req.write(rawBuffer);
  req.end();
});

// Verifica che rspamd risponda (per healthcheck applicativo)
const ping = () => new Promise((resolve) => {
  let u; try { u = new URL(RSPAMD_URL.replace(/\/$/, '') + '/ping'); } catch { return resolve(false); }
  const req = http.request({ hostname: u.hostname, port: u.port || 11333, path: u.pathname, method: 'GET', timeout: 4000 }, (res) => {
    res.resume(); resolve(res.statusCode === 200);
  });
  req.on('timeout', () => { req.destroy(); resolve(false); });
  req.on('error', () => resolve(false));
  req.end();
});

module.exports = { checkSpam, ping };
