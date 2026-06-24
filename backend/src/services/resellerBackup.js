// Backup scoped per reseller — genera un .mhbak (formato proprietario MailHaven)
// con le sole email dei clienti del reseller e lo carica sulla destinazione del
// reseller (S3 o SFTP). Stesso formato di sftpbackup.js (apribile solo da
// MailHaven o dal tool MailHavenRestore).
const { Client } = require('ssh2');
const archiver = require('archiver');
const path = require('path');
const { decompress } = require('./compression');
const { createHeader, encryptBuffer, readHeader, decryptBuffer } = require('./mhbakformat');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const AdmZip = require('adm-zip');

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

// ── RESTORE ──────────────────────────────────────────────────────────────
const s3Client = (config) => new S3Client({
  endpoint: config.endpoint || undefined,
  region: config.region || 'us-east-1',
  credentials: { accessKeyId: config.access_key, secretAccessKey: config.secret_key },
  forcePathStyle: config.force_path_style !== false,
});

const downloadS3 = async (config, key) => {
  const r = await s3Client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  const chunks = [];
  for await (const c of r.Body) chunks.push(c);
  return Buffer.concat(chunks);
};

const downloadSftp = (config, remoteFile) => new Promise((resolve, reject) => {
  const conn = new Client();
  conn.on('ready', () => conn.sftp((err, sftp) => {
    if (err) { conn.end(); return reject(err); }
    const chunks = [];
    const s = sftp.createReadStream(remoteFile);
    s.on('data', (c) => chunks.push(c));
    s.on('end', () => { conn.end(); resolve(Buffer.concat(chunks)); });
    s.on('error', (e) => { conn.end(); reject(e); });
  }));
  conn.on('error', reject);
  conn.connect({ host: config.sftp_host, port: parseInt(config.sftp_port) || 22, username: config.sftp_username, password: config.sftp_password });
});

// Scarica un .mhbak dalla destinazione, lo decifra e reimporta le email SOLO nelle
// caselle consentite. Se allowedResellerId è valorizzato, reimporta solo nelle
// caselle dei clienti di quel reseller (le altre vengono saltate). Dedup via insertEmail.
const restoreFromBuffer = async (db, fileBuffer, { allowedResellerId = null } = {}) => {
  const { iv, key: aesKey, headerEnd } = readHeader(fileBuffer, process.env.ENCRYPTION_KEY);
  const zipBuffer = decryptBuffer(fileBuffer.slice(headerEnd), aesKey, iv);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith('.eml'));

  // Mappa email→id delle caselle consentite (reseller: solo le sue)
  const mbRows = allowedResellerId
    ? (await db.query('SELECT m.id, m.email FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1', [allowedResellerId])).rows
    : (await db.query('SELECT id, email FROM mailboxes').catch(() => ({ rows: [] }))).rows;
  const mbByEmail = new Map(mbRows.map((r) => [r.email, r.id]));

  const { insertEmail } = require('../routes/import');
  let imported = 0, skipped = 0, noMailbox = 0, errors = 0;
  for (const entry of entries) {
    const parts = entry.entryName.split('/');
    const mailboxEmail = parts[0];
    const folder = parts.slice(1, -1).join('.') || 'INBOX';
    const mbId = mbByEmail.get(mailboxEmail);
    if (!mbId) { noMailbox++; continue; } // casella non consentita/inesistente → salta (scoping)
    try {
      const r = await insertEmail(db, mbId, entry.getData(), folder);
      if (r && r.skipped) skipped++; else imported++;
    } catch (e) { errors++; }
  }
  return { imported, skipped, noMailbox, errors, total: entries.length };
};

// Scarica il .mhbak dalla destinazione e lo ripristina.
const restoreFromMhbak = async (db, config, key, opts = {}) => {
  const fileBuffer = config.provider_type === 'sftp' ? await downloadSftp(config, key) : await downloadS3(config, key);
  return restoreFromBuffer(db, fileBuffer, opts);
};

module.exports = { runResellerBackup, buildResellerMhbak, restoreFromMhbak, restoreFromBuffer };
