const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

// List backups on S3
const listBackups = async (config) => {
  const client = getClient(config);
  const prefix = config.prefix || 'mailhaven-backup';

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

// Test S3 connection
const testConnection = async (config) => {
  const client = getClient(config);
  await client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    MaxKeys: 1,
  }));
  return true;
};

module.exports = { listBackups, testConnection };
