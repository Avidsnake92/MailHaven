// Backup scoped per reseller — genera un .mhbak (formato proprietario MailHaven)
// con le sole email dei clienti del reseller e lo carica sulla destinazione del
// reseller (S3 o SFTP). Stesso formato di sftpbackup.js (apribile solo da
// MailHaven o dal tool MailHavenRestore).
const { Client } = require('ssh2');
const archiver = require('archiver');
const path = require('path');
const { decompress } = require('./compression');
const { createHeader, encryptBuffer } = require('./mhbakformat');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// Costruisce il buffer .mhbak (header + zip cifrato) con le email dei clienti del reseller.
const buildResellerMhbak = async (db, resellerId, onProgress) => {
  const encKey = process.env.ENCRYPTION_KEY;
  const zipChunks = [];
  let count = 0;
  await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('data', (c) => zipChunks.push(c));
    archive.on('end', resolve);
    archive.on('error', reject);
    (async () => {
      const mailboxes = await db.query(
        'SELECT m.id, m.email FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1',
        [resellerId]
      );
      for (const mb of mailboxes.rows) {
        let offset = 0;
        while (true) {
          const emails = await db.query(
            'SELECT id, subject, path, raw FROM archived_emails WHERE mailbox_id=$1 AND raw IS NOT NULL ORDER BY id LIMIT 50 OFFSET $2',
            [mb.id, offset]
          );
          if (!emails.rows.length) break;
          for (const email of emails.rows) {
            try {
              const raw = await decompress(email.raw);
              const folder = (email.path || 'INBOX').replace(/\./g, '/');
              const subject = (email.subject || 'email').replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 40);
              archive.append(raw, { name: `${mb.email}/${folder}/${subject}_${String(email.id).substring(0, 8)}.eml` });
              count++;
            } catch (e) { /* salta email illeggibili */ }
          }
          onProgress && onProgress(Math.min(80, 10 + count));
          offset += 50;
          if (emails.rows.length < 50) break;
        }
      }
      archive.append(
        JSON.stringify({ exported_at: new Date().toISOString(), scope: 'reseller', reseller_id: resellerId, email_count: count }, null, 2),
        { name: 'backup-info.json' }
      );
      archive.finalize();
    })().catch(reject);
  });
  const zipBuffer = Buffer.concat(zipChunks);
  const metadata = { version: '1.0', created_at: new Date().toISOString(), email_count: count, scope: 'reseller', reseller_id: resellerId };
  const { header, key, iv } = createHeader(encKey, metadata);
  const encryptedZip = encryptBuffer(zipBuffer, key, iv);
  return { buffer: Buffer.concat([header, encryptedZip]), count };
};

const uploadS3 = async (config, key, buffer) => {
  const client = new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region || 'us-east-1',
    credentials: { accessKeyId: config.access_key, secretAccessKey: config.secret_key },
    forcePathStyle: config.force_path_style !== false,
  });
  await new Upload({ client, params: { Bucket: config.bucket, Key: key, Body: buffer, ContentType: 'application/octet-stream' } }).done();
};

const uploadSftp = (config, remoteFile, buffer) => new Promise((resolve, reject) => {
  const conn = new Client();
  conn.on('ready', () => conn.sftp((err, sftp) => {
    if (err) { conn.end(); return reject(err); }
    const ws = sftp.createWriteStream(remoteFile);
    ws.on('close', () => { conn.end(); resolve(); });
    ws.on('error', (e) => { conn.end(); reject(e); });
    ws.end(buffer);
  }));
  conn.on('error', reject);
  conn.connect({
    host: config.sftp_host, port: parseInt(config.sftp_port) || 22,
    username: config.sftp_username, password: config.sftp_password,
  });
});

const runResellerBackup = async (db, config, resellerId, onProgress) => {
  const { buffer, count } = await buildResellerMhbak(db, resellerId, onProgress);
  onProgress && onProgress(90);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  let location;
  if (config.provider_type === 'sftp') {
    const remotePath = config.sftp_remote_path || '/backups';
    location = path.posix.join(remotePath, `mailhaven-${timestamp}.mhbak`);
    await uploadSftp(config, location, buffer);
  } else {
    location = `${config.prefix || 'mailhaven-backup'}/mailhaven-${timestamp}.mhbak`;
    await uploadS3(config, location, buffer);
  }
  await db.query(
    'INSERT INTO backup_log (type, status, details, reseller_id) VALUES ($1,$2,$3,$4)',
    [config.provider_type, 'success', JSON.stringify({ key: location, size: buffer.length, email_count: count }), resellerId]
  );
  onProgress && onProgress(100);
  return { key: location, size: buffer.length, email_count: count };
};

module.exports = { runResellerBackup, buildResellerMhbak };
