const { Client } = require('ssh2');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

const runSftpBackup = (config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const storageRoot = '/var/data/open-archiver';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const remoteFile = path.join(config.remote_path || '/backups', `mailvault-${timestamp}.zip`);

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }

        // Create write stream to remote file
        const writeStream = sftp.createWriteStream(remoteFile);
        const archive = archiver('zip', { zlib: { level: 9 } });

        writeStream.on('close', () => {
          conn.end();
          resolve({ key: remoteFile, size: archive.pointer() });
        });

        writeStream.on('error', (err) => { conn.end(); reject(err); });
        archive.on('error', (err) => { conn.end(); reject(err); });

        archive.pipe(writeStream);

        // Walk storage directory
        const walkDir = (dir, baseDir = '') => {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const zipPath = path.join(baseDir, entry.name);
            if (entry.isDirectory()) walkDir(fullPath, zipPath);
            else if (entry.name.endsWith('.eml')) archive.file(fullPath, { name: zipPath });
          }
        };

        walkDir(storageRoot);
        archive.finalize();
      });
    });

    conn.on('error', reject);

    const connConfig = {
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
    };

    if (config.password) connConfig.password = config.password;
    if (config.private_key) connConfig.privateKey = config.private_key;

    conn.connect(connConfig);
  });
};

const listSftpBackups = (config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const remotePath = config.remote_path || '/backups';

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
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      password: config.password,
    });
  });
};

const restoreSftpBackup = (config, remoteFile) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const storageRoot = '/var/data/open-archiver';
    const unzipper = require('unzipper');

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }

        const readStream = sftp.createReadStream(remoteFile);
        readStream
          .pipe(unzipper.Extract({ path: storageRoot }))
          .on('close', () => { conn.end(); resolve({ restored: true }); })
          .on('error', (err) => { conn.end(); reject(err); });
      });
    });

    conn.on('error', reject);
    conn.connect({
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      password: config.password,
    });
  });
};

const testSftpConnection = (config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => { conn.end(); resolve(true); });
    conn.on('error', reject);
    conn.connect({
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      password: config.password,
    });
  });
};

module.exports = { runSftpBackup, listSftpBackups, restoreSftpBackup, testSftpConnection };
