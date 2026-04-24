const { exec } = require('child_process');

let avTimer = null;

const runFreshclam = () => {
  console.log('[AV Scheduler] Aggiornamento database ClamAV...');
  exec('freshclam --quiet 2>&1', (err, stdout, stderr) => {
    if (err) console.error('[AV Scheduler] Errore freshclam:', stderr || err.message);
    else console.log('[AV Scheduler] Database ClamAV aggiornato.');
  });
};

const msUntil = (timeStr) => {
  // Calcola ms fino al prossimo orario HH:MM
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
};

const start = async (db) => {
  if (avTimer) { clearTimeout(avTimer); avTimer = null; }

  try {
    const r = await db.query("SELECT value FROM settings WHERE key IN ('av_update_hours','av_update_time')");
    const settings = {};
    r.rows.forEach(row => {
      if (row.key) settings[row.key] = row.value;
    });

    // Rileggi con i nomi corretti
    const rr = await db.query("SELECT key, value FROM settings WHERE key IN ('av_update_hours','av_update_time')");
    rr.rows.forEach(row => { settings[row.key] = row.value; });

    const hours = parseInt(settings.av_update_hours || '24');
    const time = settings.av_update_time || '02:00';

    if (hours === 0) {
      console.log('[AV Scheduler] Aggiornamento automatico disabilitato');
      return;
    }

    const intervalMs = hours * 60 * 60 * 1000;
    const delayMs = msUntil(time);

    console.log(`[AV Scheduler] Primo aggiornamento alle ${time}, poi ogni ${hours}h`);

    avTimer = setTimeout(() => {
      runFreshclam();
      avTimer = setInterval(runFreshclam, intervalMs);
    }, delayMs);

  } catch (e) {
    console.error('[AV Scheduler] Errore configurazione:', e.message);
  }
};

const stop = () => {
  if (avTimer) { clearTimeout(avTimer); clearInterval(avTimer); avTimer = null; }
};

module.exports = { start, stop };
