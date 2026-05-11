// Migration automatica — eseguita ad ogni avvio del backend
// Usa ADD COLUMN IF NOT EXISTS per essere idempotente

const migrate = async (db) => {
  const migrations = [
    // archived_emails
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT NULL`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS av_status VARCHAR(20) DEFAULT NULL`,
    // mailboxes
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMP`,
    // users
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
  ];

  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch (e) {
      console.warn('[Migration] Skip:', e.message.split('\n')[0]);
    }
  }
  console.log('[Migration] Completata');
};

module.exports = migrate;
