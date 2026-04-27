const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Store job progress in memory
const backupJobs = new Map();

const createJob = () => {
  const id = crypto.randomBytes(8).toString('hex');
  backupJobs.set(id, { status: 'running', progress: 0, message: 'Avvio backup...', started_at: new Date() });
  return id;
};

const updateJob = (id, data) => {
  if (backupJobs.has(id)) backupJobs.set(id, { ...backupJobs.get(id), ...data });
};

// GET /backup/status/:jobId
router.get('/status/:jobId', (req, res) => {
  const job = backupJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job non trovato' });
  res.json(job);
});
const { authMiddleware, requireRole } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/crypto');
const { runBackup, listBackups, restoreBackup, testConnection } = require('../services/s3backup');
const { runSftpBackup, runSftpBackupWithProgress, listSftpBackups, restoreSftpBackup, testSftpConnection } = require('../services/sftpbackup');
const { log } = require('../services/logger');
const getIp = (req) => { const fwd = req.headers['x-forwarded-for']; return fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress; };

router.use(authMiddleware);
router.use(requireRole('superadmin'));

const getConfig = async (db, type = null) => {
  const query = type 
    ? 'SELECT * FROM backup_config WHERE provider_type = $1 LIMIT 1'
    : 'SELECT * FROM backup_config LIMIT 1';
  const params = type ? [type] : [];
  const result = await db.query(query, params);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    ...row,
    secret_key: row.secret_key_encrypted ? decrypt(row.secret_key_encrypted) : null,
    sftp_password: row.sftp_password_encrypted ? decrypt(row.sftp_password_encrypted) : null,
  };
};

// Get all configs
router.get('/config', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT id, provider_type, provider, endpoint, region, bucket, access_key, prefix, 
       force_path_style, schedule, enabled, last_backup_at,
       sftp_host, sftp_port, sftp_username, sftp_remote_path,
       CASE WHEN secret_key_encrypted IS NOT NULL THEN true ELSE false END as has_secret,
       CASE WHEN sftp_password_encrypted IS NOT NULL THEN true ELSE false END as has_sftp_password
       FROM backup_config ORDER BY id`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// Save config
router.post('/config', async (req, res) => {
  const db = req.app.locals.db;
  const { 
    provider_type, provider, endpoint, region, bucket, access_key, secret_key, 
    prefix, force_path_style, schedule, enabled,
    sftp_host, sftp_port, sftp_username, sftp_password, sftp_remote_path
  } = req.body;
  try {
    const existing = await db.query('SELECT id FROM backup_config WHERE provider_type = $1', [provider_type]);
    const encSecret = secret_key ? encrypt(secret_key) : null;
    const encSftpPass = sftp_password ? encrypt(sftp_password) : null;

    if (existing.rows[0]) {
      let q, p;
      if (provider_type === 's3') {
        q = `UPDATE backup_config SET provider=$1, endpoint=$2, region=$3, bucket=$4, access_key=$5, 
             prefix=$6, force_path_style=$7, schedule=$8, enabled=$9, updated_at=NOW()
             ${secret_key ? ', secret_key_encrypted=$11' : ''} WHERE id=$10`;
        p = secret_key 
          ? [provider, endpoint, region, bucket, access_key, prefix || 'mailvault-backup', force_path_style !== false, schedule || 'manual', enabled || false, existing.rows[0].id, encSecret]
          : [provider, endpoint, region, bucket, access_key, prefix || 'mailvault-backup', force_path_style !== false, schedule || 'manual', enabled || false, existing.rows[0].id];
      } else {
        q = `UPDATE backup_config SET sftp_host=$1, sftp_port=$2, sftp_username=$3, 
             sftp_remote_path=$4, schedule=$5, enabled=$6, updated_at=NOW()
             ${sftp_password ? ', sftp_password_encrypted=$8' : ''} WHERE id=$7`;
        p = sftp_password
          ? [sftp_host, sftp_port || 22, sftp_username, sftp_remote_path || '/backups', schedule || 'manual', enabled || false, existing.rows[0].id, encSftpPass]
          : [sftp_host, sftp_port || 22, sftp_username, sftp_remote_path || '/backups', schedule || 'manual', enabled || false, existing.rows[0].id];
      }
      await db.query(q, p);
    } else {
      await db.query(
        `INSERT INTO backup_config (provider_type, provider, endpoint, region, bucket, access_key, 
         secret_key_encrypted, prefix, force_path_style, schedule, enabled,
         sftp_host, sftp_port, sftp_username, sftp_password_encrypted, sftp_remote_path) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [provider_type, provider, endpoint, region, bucket, access_key, encSecret,
         prefix || 'mailvault-backup', force_path_style !== false, schedule || 'manual', enabled || false,
         sftp_host, sftp_port || 22, sftp_username, encSftpPass, sftp_remote_path || '/backups']
      );
    }
    await log(db, req.user.id, 'BACKUP_CONFIG_UPDATED', { provider_type, provider }, getIp(req));
    res.json({ message: 'Configurazione salvata' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

// Test connection
router.post('/test', async (req, res) => {
  const { provider_type, host, port, username, password, remote_path,
          endpoint, region, bucket, access_key, secret_key, prefix } = req.body;
  const db = req.app.locals.db;
  try {
    let config;
    if (provider_type === 'sftp') {
      // Usa i dati dal body se presenti, altrimenti dal DB
      if (host && username && password) {
        config = { sftp_host: host, sftp_port: port || 22, sftp_username: username, sftp_password: password, sftp_remote_path: remote_path || '/backups' };
      } else {
        config = await getConfig(db, provider_type);
        if (!config) return res.status(400).json({ error: 'Nessuna configurazione trovata. Salva prima le credenziali.' });
      }
      await testSftpConnection(config);
    } else {
      if (access_key && secret_key) {
        config = { endpoint, region, bucket, access_key, secret_key, prefix };
      } else {
        config = await getConfig(db, provider_type);
        if (!config) return res.status(400).json({ error: 'Nessuna configurazione trovata. Salva prima le credenziali.' });
      }
      await testConnection(config);
    }
    res.json({ success: true, message: 'Connessione riuscita!' });
  } catch (err) {
    res.status(400).json({ success: false, error: `Connessione fallita: ${err.message}` });
  }
});

// Run backup (asincrono con progress)
router.post('/run', async (req, res) => {
  const { provider_type } = req.body;
  const db = req.app.locals.db;
  try {
    const config = await getConfig(db, provider_type || 's3');
    if (!config) return res.status(400).json({ error: 'Configura prima le credenziali' });

    // Crea job e rispondi subito con job_id
    const jobId = createJob();
    res.json({ job_id: jobId, message: 'Backup avviato' });

    // Esegui backup in background
    setImmediate(async () => {
      try {
        let result;
        updateJob(jobId, { progress: 5, message: 'Connessione al server...' });

        if (provider_type === 'sftp') {
          if (!config.sftp_password) throw new Error('Password SFTP non configurata');
          updateJob(jobId, { progress: 10, message: 'Lettura email dal database...' });
          result = await runSftpBackupWithProgress(config, (progress, message) => {
            updateJob(jobId, { progress, message });
          });
        } else {
          if (!config.secret_key) throw new Error('Secret key non configurata');
          result = await runBackup(db, config);
        }

        await db.query('UPDATE backup_config SET last_backup_at = NOW() WHERE id = $1', [config.id]);
        await db.query('INSERT INTO backup_log (type, status, details) VALUES ($1,$2,$3)', [provider_type || 's3', 'success', JSON.stringify(result)]);
        await log(db, req.user.id, 'BACKUP_COMPLETED', result, getIp(req));
        updateJob(jobId, { status: 'completed', progress: 100, message: 'Backup completato!', result });
      } catch (err) {
        updateJob(jobId, { status: 'error', progress: 0, message: err.message });
      }
    });
    return;

    // Apply retention policy
    try {
      let allBackups = [];
      if (provider_type === 'sftp') {
        allBackups = await listSftpBackups({ host: config.sftp_host, port: config.sftp_port, username: config.sftp_username, password: config.sftp_password, remote_path: config.sftp_remote_path });
      } else {
        allBackups = await listBackups(config);
      }

      const toDelete = [];
      if (config.retention_versions && allBackups.length > config.retention_versions) {
        toDelete.push(...allBackups.slice(config.retention_versions));
      } else if (config.retention_days) {
        const cutoff = new Date(Date.now() - config.retention_days * 86400000);
        toDelete.push(...allBackups.filter(b => new Date(b.date) < cutoff));
      }

      for (const b of toDelete) {
        try {
          if (provider_type === 'sftp') {
            // Delete via SFTP - implement if needed
          } else {
            const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
            const { S3Client } = require('@aws-sdk/client-s3');
            const client = new S3Client({ endpoint: config.endpoint, region: config.region || 'us-east-1', credentials: { accessKeyId: config.access_key, secretAccessKey: config.secret_key }, forcePathStyle: config.force_path_style !== false });
            await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: b.key }));
          }
        } catch (e) { console.error('Retention delete error:', e.message); }
      }
    } catch (e) { console.error('Retention error:', e.message); }

    res.json({ success: true, message: 'Backup completato', ...result });
  } catch (err) {
    console.error('Backup error:', err);
    await db.query('INSERT INTO backup_log (type, status, details) VALUES ($1,$2,$3)', [provider_type || 's3', 'error', JSON.stringify({ error: err.message })]);
    res.status(500).json({ error: `Backup fallito: ${err.message}` });
  }
});

// List backups
router.get('/list', async (req, res) => {
  const { type } = req.query;
  const db = req.app.locals.db;
  try {
    const config = await getConfig(db, type || 's3');
    if (!config) return res.json([]);

    let backups;
    if (type === 'sftp') {
      if (!config.sftp_password) return res.json([]);
      backups = await listSftpBackups({ host: config.sftp_host, port: config.sftp_port, username: config.sftp_username, password: config.sftp_password, remote_path: config.sftp_remote_path });
    } else {
      if (!config.secret_key) return res.json([]);
      backups = await listBackups(config);
    }
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore
router.post('/restore', async (req, res) => {
  const { key, provider_type } = req.body;
  const db = req.app.locals.db;
  try {
    const config = await getConfig(db, provider_type || 's3');
    if (!config) return res.status(400).json({ error: 'Configurazione mancante' });

    let result;
    if (provider_type === 'sftp') {
      result = await restoreSftpBackup({ host: config.sftp_host, port: config.sftp_port, username: config.sftp_username, password: config.sftp_password }, key);
    } else {
      result = await restoreBackup(config, key);
    }

    await log(db, req.user.id, 'BACKUP_RESTORED', { key, provider_type }, getIp(req));
    res.json({ success: true, message: 'Restore completato con successo.' });
  } catch (err) {
    res.status(500).json({ error: `Restore fallito: ${err.message}` });
  }
});

// Logs
router.get('/logs', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

module.exports = router;
