const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { Upload } = require('@aws-sdk/lib-storage');
const { log } = require('./logger');

const getClient = (config) => {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.access_key,
      secretAccessKey: config.secret_key,
    },
    forcePathStyle: config.force_path_style !== false, // needed for MinIO, SeaweedFS, etc.
  });
};

// Backup all EML files to S3 as compressed ZIP
const runBackup = async (db, config) => {
  const client = getClient(config);
  const storageRoot = '/var/data/open-archiver';
  const fs = require('fs');
  const path = require('path');

  // Build ZIP in memory and stream to S3
  const passThrough = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(passThrough);

  // Walk storage directory and add EML files
  const walkDir = (dir, baseDir = '') => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const zipPath = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, zipPath);
      } else if (entry.name.endsWith('.eml')) {
        archive.file(fullPath, { name: zipPath });
      }
    }
  };

  walkDir(storageRoot);
  archive.finalize();

  // Upload to S3
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const key = `${config.prefix || 'mailvault-backup'}/${timestamp}.zip`;

  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucket,
      Key: key,
      Body: passThrough,
      ContentType: 'application/zip',
    },
  });

  await upload.done();

  // Log to DB
  const size = archive.pointer();
  await db.query(
    'INSERT INTO backup_log (type, status, details, created_at) VALUES ($1, $2, $3, NOW())',
    ['s3', 'success', JSON.stringify({ key, size, endpoint: config.endpoint, bucket: config.bucket })]
  );

  return { key, size };
};

// List backups on S3
const listBackups = async (config) => {
  const client = getClient(config);
  const prefix = config.prefix || 'mailvault-backup';

  const response = await client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: prefix,
  }));

  return (response.Contents || [])
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
    .map(obj => ({
      key: obj.Key,
      size: obj.Size,
      date: obj.LastModified,
    }));
};

// Restore from S3 backup
const restoreBackup = async (config, key) => {
  const client = getClient(config);
  const storageRoot = '/var/data/open-archiver';
  const fs = require('fs');
  const path = require('path');
  const unzipper = require('unzipper');

  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));

  // Extract ZIP to storage root
  await new Promise((resolve, reject) => {
    response.Body
      .pipe(unzipper.Extract({ path: storageRoot }))
      .on('close', resolve)
      .on('error', reject);
  });

  return { restored: true, key };
};

// Test S3 connection
const testConnection = async (config) => {
  const client = getClient(config);
  await client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    MaxKeys: 1,
  }));
  return true;
};

module.exports = { runBackup, listBackups, restoreBackup, testConnection };
