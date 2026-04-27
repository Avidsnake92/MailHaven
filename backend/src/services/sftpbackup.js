const { Client } = require('ssh2');
const archiver = require('archiver');
const path = require('path');
const { Pool } = require('pg');
const { decompress } = require('./compression');

const getDbPool = () => new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const runSftpBackup = (config) => {
  return new Promise(async (resolve, reject) => {
    const conn = new Client();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const remotePath = config.sftp_remote_path || config.remote_path || '/backups';
    const remoteFile = path.join(remotePath, `mailvault-${timestamp}.zip`);
    const pool = getDbPool();

    conn.on('ready', async () => {
      conn.sftp(async (err, sftp) => {
        if (err) { conn.end(); pool.end(); return reject(err); }

        try {
          const writeStream = sftp.createWriteStream(remoteFile);
          const archive = archiver('zip', { zlib: { level: 6 } });

          writeStream.on('close', () => {
            conn.end(); pool.end();
            resolve({ key: remoteFile, size: archive.pointer() });
          });
          writeStream.on('error', (err) => { conn.end(); pool.end(); reject(err); });
          archive.on('error', (err) => { conn.end(); pool.end(); reject(err); });

          archive.pipe(writeStream);

          // Esporta email dal DB come EML files
          const mailboxes = await pool.query('SELECT id, email FROM mailboxes WHERE active=true');
          for (const mb of mailboxes.rows) {
            let offset = 0;
            while (true) {
              const emails = await pool.query(
                'SELECT id, subject, path, raw FROM archived_emails WHERE mailbox_id=$1 AND raw IS NOT NULL ORDER BY id LIMIT 50 OFFSET $2',
                [mb.id, offset]
              );
              if (!emails.rows.length) break;
              for (const email of emails.rows) {
                try {
                  const raw = await decompress(email.raw);
                  const folder = (email.path || 'INBOX').replace(/\./g, '/');
                  const subject = (email.subject || 'email').replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 40);
                  const filename = `${mb.email}/${folder}/${subject}_${email.id.substring(0,8)}.eml`;
                  archive.append(raw, { name: filename });
                } catch (e) { console.error(`Backup skip email ${email.id}:`, e.message); }
              }
              offset += 50;
              if (emails.rows.length < 50) break;
            }
          }

          // Aggiungi anche dump metadata JSON
          const stats = await pool.query(`
            SELECT m.email, COUNT(ae.id) as count, SUM(ae.size_bytes) as total_bytes
            FROM mailboxes m LEFT JOIN archived_emails ae ON ae.mailbox_id=m.id
            GROUP BY m.email`);
          archive.append(JSON.stringify({
            exported_at: new Date().toISOString(),
            mailboxes: stats.rows
          }, null, 2), { name: 'backup-info.json' });

          archive.finalize();
        } catch (err) {
          conn.end(); pool.end(); reject(err);
        }
      });
    });

    conn.on('error', (err) => { pool.end(); reject(err); });
    conn.connect({
      host: config.sftp_host || config.host,
      port: parseInt(config.sftp_port || config.port) || 22,
      username: config.sftp_username || config.username,
      password: config.sftp_password || config.password,
    });
  });
};

const listSftpBackups = (config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const remotePath = config.sftp_remote_path || config.remote_path || '/backups';
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        sftp.readdir(remotePath, (err, list) => {
          conn.end();
          if (err) return reject(err);
          const backups = list
            .filter(f => f.filename.startsWith('mailvault-') && f.filename.endsWith('.zip'))
            .sort((a, b) => b.attrs.mtime - a.attrs.mtime)
            .map(f => ({
              key: path.join(remotePath, f.filename),
              filename: f.filename,
              size: f.attrs.size,
              date: new Date(f.attrs.mtime * 1000),
            }));
          resolve(backups);
        });
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: config.sftp_host || config.host,
      port: parseInt(config.sftp_port || config.port) || 22,
      username: config.sftp_username || config.username,
      password: config.sftp_password || config.password,
    });
  });
};

const restoreSftpBackup = (config, remoteFile) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        const readStream = sftp.createReadStream(remoteFile);
        let size = 0;
        readStream.on('data', chunk => size += chunk.length);
        readStream.on('end', () => { conn.end(); resolve({ restored: true, size }); });
        readStream.on('error', (err) => { conn.end(); reject(err); });
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: config.sftp_host || config.host,
      port: parseInt(config.sftp_port || config.port) || 22,
      username: config.sftp_username || config.username,
      password: config.sftp_password || config.password,
    });
  });
};

const testSftpConnection = (config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => { conn.end(); resolve(true); });
    conn.on('error', reject);
    conn.connect({
      host: config.host || config.sftp_host,
      port: parseInt(config.port || config.sftp_port) || 22,
      username: config.username || config.sftp_username,
      password: config.password || config.sftp_password,
      readyTimeout: 10000,
    });
  });
};

const runSftpBackupWithProgress = (config, onProgress) => {
  return new Promise(async (resolve, reject) => {
    const conn = new Client();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const remotePath = config.sftp_remote_path || config.remote_path || '/backups';
    const remoteFile = path.join(remotePath, `mailvault-${timestamp}.zip`);
    const pool = getDbPool();

    conn.on('ready', async () => {
      conn.sftp(async (err, sftp) => {
        if (err) { conn.end(); pool.end(); return reject(err); }
        try {
          const writeStream = sftp.createWriteStream(remoteFile);
          const archive = archiver('zip', { zlib: { level: 6 } });

          writeStream.on('close', () => { conn.end(); pool.end(); resolve({ key: remoteFile, size: archive.pointer() }); });
          writeStream.on('error', (err) => { conn.end(); pool.end(); reject(err); });
          archive.on('error', (err) => { conn.end(); pool.end(); reject(err); });
          archive.pipe(writeStream);

          // Conta totale email
          const totalR = await pool.query('SELECT COUNT(*) FROM archived_emails WHERE raw IS NOT NULL');
          const total = parseInt(totalR.rows[0].count);
          let processed = 0;

          const mailboxes = await pool.query('SELECT id, email FROM mailboxes WHERE active=true');
          for (const mb of mailboxes.rows) {
            onProgress && onProgress(10 + Math.round((processed / Math.max(total, 1)) * 80), `Backup ${mb.email}...`);
            let offset = 0;
            while (true) {
              const emails = await pool.query(
                'SELECT id, subject, path, raw FROM archived_emails WHERE mailbox_id=$1 AND raw IS NOT NULL ORDER BY id LIMIT 50 OFFSET $2',
                [mb.id, offset]
              );
              if (!emails.rows.length) break;
              for (const email of emails.rows) {
                try {
                  const raw = await decompress(email.raw);
                  const folder = (email.path || 'INBOX').replace(/\./g, '/');
                  const subject = (email.subject || 'email').replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 40);
                  archive.append(raw, { name: `${mb.email}/${folder}/${subject}_${email.id.substring(0,8)}.eml` });
                  processed++;
                } catch (e) {}
              }
              onProgress && onProgress(10 + Math.round((processed / Math.max(total, 1)) * 80), `Email ${processed}/${total}...`);
              offset += 50;
              if (emails.rows.length < 50) break;
            }
          }

          // Metadata
          const stats = await pool.query(`SELECT m.email, COUNT(ae.id) as count FROM mailboxes m LEFT JOIN archived_emails ae ON ae.mailbox_id=m.id GROUP BY m.email`);
          archive.append(JSON.stringify({ exported_at: new Date().toISOString(), mailboxes: stats.rows }, null, 2), { name: 'backup-info.json' });
          onProgress && onProgress(95, 'Finalizzazione ZIP...');
          archive.finalize();
        } catch (err) { conn.end(); pool.end(); reject(err); }
      });
    });

    conn.on('error', (err) => { pool.end(); reject(err); });
    conn.connect({
      host: config.sftp_host || config.host,
      port: parseInt(config.sftp_port || config.port) || 22,
      username: config.sftp_username || config.username,
      password: config.sftp_password || config.password,
    });
  });
};

module.exports = { runSftpBackup, runSftpBackupWithProgress, listSftpBackups, restoreSftpBackup, testSftpConnection };
