// Migration automatica — eseguita ad ogni avvio del backend
// Idempotente: usa ADD COLUMN IF NOT EXISTS e ON CONFLICT DO NOTHING
// Serve solo per DB esistenti creati con versioni vecchie di init.sql

const migrate = async (db) => {
  const migrations = [
    // archived_emails — colonne aggiunte dopo la prima release
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT 0`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT false`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS av_status VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS search_vector tsvector`,

    // mailboxes — colonne aggiunte dopo la prima release
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT false`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_access_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP`,
    `ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_expires_at TIMESTAMP`,

    // spam_cache — aggiunta mailbox_id
    `ALTER TABLE spam_cache ADD COLUMN IF NOT EXISTS mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE`,

    // users — colonne sicurezza
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,

    // plugin_tokens — fix user_id UUID -> INTEGER
    `DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='plugin_tokens' AND column_name='user_id' AND data_type='uuid'
      ) THEN
        ALTER TABLE plugin_tokens DROP CONSTRAINT IF EXISTS plugin_tokens_user_id_fkey;
        ALTER TABLE plugin_tokens ALTER COLUMN user_id TYPE INTEGER USING NULL;
        ALTER TABLE plugin_tokens ADD CONSTRAINT plugin_tokens_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$`,

    // Indici mancanti
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector)`,
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_is_deleted ON archived_emails(is_deleted) WHERE is_deleted = true`,
    `CREATE INDEX IF NOT EXISTS idx_archived_emails_av_status ON archived_emails(av_status) WHERE has_attachments = true`,

    // Settings mancanti
    `INSERT INTO settings (key, value) VALUES ('sync_interval_minutes', '15') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO settings (key, value) VALUES ('sync_enabled', 'true') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO settings (key, value) VALUES ('setup_completed', 'false') ON CONFLICT (key) DO NOTHING`,
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
