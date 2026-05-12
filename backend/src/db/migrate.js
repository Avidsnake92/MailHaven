// Migration automatica — eseguita ad ogni avvio del backend
const migrate = async (db) => {
  const migrations = [
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT 0`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT false`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS av_status VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_pec BOOLEAN DEFAULT false`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS pec_type VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS search_vector tsvector`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT false`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_access_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_expires_at TIMESTAMP`,
    `ALTER TABLE spam_cache ADD COLUMN IF NOT EXISTS mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector)`,
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_is_deleted ON archived_emails(is_deleted) WHERE is_deleted = true`,
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_av_status ON archived_emails(av_status) WHERE has_attachments = true`,
    `INSERT INTO settings (key, value) VALUES ('sync_interval_minutes', '15') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO settings (key, value) VALUES ('sync_enabled', 'true') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO settings (key, value) VALUES ('setup_completed', 'false') ON CONFLICT (key) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'bug',
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      priority VARCHAR(50) NOT NULL DEFAULT 'normal',
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      page_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS report_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_staff BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`,
    `CREATE INDEX IF NOT EXISTS idx_report_messages_report_id ON report_messages(report_id)`,
  ];

  let ok = 0;
  let skip = 0;
  for (const sql of migrations) {
    try {
      await db.query(sql);
      ok++;
    } catch (e) {
      skip++;
      console.warn('[Migration] Skip:', e.message.split('\n')[0]);
    }
  }
  console.log(`[Migration] Completata — ${ok} OK, ${skip} skip`);
};

module.exports = migrate;
