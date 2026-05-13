const migrate = async (db) => {
  const run = async (sql) => { try { await db.query(sql); } catch(e) { console.warn('[Migration] Skip:', e.message.split('\n')[0]); } };

  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT 0`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS av_status VARCHAR(50) DEFAULT NULL`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS search_vector tsvector`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_pec BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS pec_type VARCHAR(50) DEFAULT NULL`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_access_token TEXT`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_expires_at TIMESTAMP`);
  await run(`ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS archive_policy JSONB DEFAULT NULL`);
  await run(`ALTER TABLE spam_cache ADD COLUMN IF NOT EXISTS mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_is_deleted ON archived_emails(is_deleted) WHERE is_deleted = true`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_av_status ON archived_emails(av_status) WHERE has_attachments = true`);
  await run(`INSERT INTO settings (key, value) VALUES ('sync_interval_minutes', '15') ON CONFLICT (key) DO NOTHING`);
  await run(`INSERT INTO settings (key, value) VALUES ('sync_enabled', 'true') ON CONFLICT (key) DO NOTHING`);
  await run(`CREATE TABLE IF NOT EXISTS reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, type VARCHAR(50) NOT NULL DEFAULT 'bug', status VARCHAR(50) NOT NULL DEFAULT 'open', priority VARCHAR(50) NOT NULL DEFAULT 'normal', title VARCHAR(255) NOT NULL, description TEXT NOT NULL, page_url VARCHAR(500), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await run(`CREATE TABLE IF NOT EXISTS report_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, message TEXT NOT NULL, is_staff BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())`);
  await run(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_report_messages_report_id ON report_messages(report_id)`);
  await run(`DROP TRIGGER IF EXISTS trig_deduplicate_email ON archived_emails`);
  await run(`CREATE OR REPLACE FUNCTION deduplicate_by_message_id() RETURNS TRIGGER AS $func$ BEGIN IF NEW.message_id IS NOT NULL THEN DELETE FROM archived_emails WHERE mailbox_id = NEW.mailbox_id AND message_id = NEW.message_id AND id != NEW.id; END IF; RETURN NEW; END; $func$ LANGUAGE plpgsql`);
  await run(`CREATE TRIGGER trig_deduplicate_email AFTER INSERT ON archived_emails FOR EACH ROW EXECUTE FUNCTION deduplicate_by_message_id()`);

  console.log('[Migration] Completata');
};

module.exports = migrate;
