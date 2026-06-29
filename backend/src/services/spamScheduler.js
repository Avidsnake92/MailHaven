// Scoring antispam automatico: ogni intervallo valuta in background un piccolo
// blocco di email non ancora valutate (mh_spam_score NULL), throttled per non
// saturare Rspamd/RAM. Attivabile/disattivabile da settings (spam_autoscore).
const { scoreBatch } = require('./spamScorer');
const { ping } = require('./rspamdClient');

const INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti
const TICK_LIMIT = 100;            // max email per giro
const PAUSE_MS = 200;              // pausa tra una email e l'altra

let timer = null;
let running = false;

const isEnabled = async (db) => {
  try {
    const r = await db.query("SELECT value FROM settings WHERE key='spam_autoscore'");
    return !r.rows[0] || r.rows[0].value !== 'false'; // default attivo
  } catch { return false; }
};

const tick = async (db) => {
  if (running) return;
  running = true;
  try {
    if (!(await require('./license').feature(db, 'antispam'))) return;
    if (!(await isEnabled(db))) return;
    if (!(await ping())) return; // Rspamd non raggiungibile → salta questo giro
    const res = await scoreBatch(db, TICK_LIMIT, PAUSE_MS);
    if (res.scored) console.log(`[spam-scheduler] valutate ${res.scored} email (${res.errors} errori)`);
  } catch (e) {
    console.error('[spam-scheduler] errore:', e.message);
  } finally {
    running = false;
  }
};

const start = async (db) => {
  stop();
  timer = setInterval(() => tick(db), INTERVAL_MS);
  setTimeout(() => tick(db), 25000); // primo giro ~25s dopo l'avvio
  console.log('Spam scheduler started');
};

const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

module.exports = { start, stop };
