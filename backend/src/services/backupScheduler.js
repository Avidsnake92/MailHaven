// Scheduler dei backup pianificati (cron). Gestisce sia i backup globali del
// superadmin (reseller_id NULL) sia quelli dei reseller (reseller_id valorizzato).
const cron = require('node-cron');
const { decrypt } = require('./crypto');

const tasks = new Map(); // backup_config.id -> cron task

const buildConfig = (row) => ({
  ...row,
  secret_key: row.secret_key_encrypted ? decrypt(row.secret_key_encrypted) : null,
  sftp_password: row.sftp_password_encrypted ? decrypt(row.sftp_password_encrypted) : null,
});

const runOne = async (db, row) => {
  const config = buildConfig(row);
  try {
    if (row.reseller_id) {
      const { runResellerBackup } = require('./resellerBackup');
      await runResellerBackup(db, config, row.reseller_id);
    } else if (row.provider_type === 'sftp') {
      const { runSftpBackup } = require('./sftpbackup');
      const r = await runSftpBackup(config);
      await db.query('INSERT INTO backup_log (type, status, details) VALUES ($1,$2,$3)', ['sftp', 'success', JSON.stringify(r)]);
    } else {
      const { runBackup } = require('./s3backup');
      await runBackup(db, config);
    }
    await db.query('UPDATE backup_config SET last_backup_at=NOW() WHERE id=$1', [row.id]);
    console.log(`[backup-scheduler] backup pianificato eseguito (config ${row.id}, reseller ${row.reseller_id || 'globale'})`);
  } catch (e) {
    console.error(`[backup-scheduler] errore config ${row.id}:`, e.message);
    try {
      await db.query('INSERT INTO backup_log (type, status, details, reseller_id) VALUES ($1,$2,$3,$4)',
        [row.provider_type || 's3', 'error', JSON.stringify({ error: e.message, scheduled: true }), row.reseller_id || null]);
    } catch {}
  }
};

const reload = async (db) => {
  for (const t of tasks.values()) { try { t.stop(); } catch {} }
  tasks.clear();
  try {
    const rows = (await db.query("SELECT * FROM backup_config WHERE enabled=true AND schedule IS NOT NULL AND schedule <> 'manual'")).rows;
    for (const row of rows) {
      if (!cron.validate(row.schedule)) { console.warn('[backup-scheduler] cron non valido, salto config', row.id, row.schedule); continue; }
      const task = cron.schedule(row.schedule, () => runOne(db, row));
      tasks.set(row.id, task);
    }
    console.log(`[backup-scheduler] ${tasks.size} backup pianificati`);
  } catch (e) { console.error('[backup-scheduler] reload error:', e.message); }
};

const start = async (db) => { await reload(db); };
const stop = () => { for (const t of tasks.values()) { try { t.stop(); } catch {} } tasks.clear(); };

module.exports = { start, stop, reload, runOne, count: () => tasks.size };
