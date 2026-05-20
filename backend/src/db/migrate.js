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

  // Badge temporizzati
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS badge_type VARCHAR(20) DEFAULT NULL`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS badge_expires_at TIMESTAMP DEFAULT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_badge_expires ON archived_emails(badge_expires_at) WHERE badge_expires_at IS NOT NULL`);
  await run(`INSERT INTO settings (key, value) VALUES ('badge_duration_days', '30') ON CONFLICT (key) DO NOTHING`);

  // Colonne extra sync_log per dettagli operazioni
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS emails_archived INTEGER DEFAULT 0`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS emails_deleted_external INTEGER DEFAULT 0`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT NULL`);

  // Fix date 1970 — recupera data dagli header JSON salvati
  try {
    const bad = await db.query(`
      SELECT id, headers FROM archived_emails
      WHERE (EXTRACT(YEAR FROM sent_at) <= 1970 OR sent_at IS NULL)
      AND headers IS NOT NULL
      LIMIT 5000
    `);
    if (bad.rows.length > 0) {
      console.log(`[Migration] Fix date 1970: ${bad.rows.length} email da correggere...`);
      let fixed = 0;
      for (const row of bad.rows) {
        try {
          const headers = typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers;
          const raw = headers['date'] || headers['Date'] || null;
          if (!raw) continue;
          const d = new Date(raw);
          if (!isNaN(d.getTime()) && d.getFullYear() > 1970 && d.getFullYear() < 2100) {
            await db.query(`UPDATE archived_emails SET sent_at=$1 WHERE id=$2`, [d, row.id]);
            fixed++;
          }
        } catch {}
      }
      console.log(`[Migration] Fix date 1970: ${fixed}/${bad.rows.length} email corrette`);
    }
  } catch (e) {
    console.warn('[Migration] Fix date 1970 skip:', e.message);
  }

  console.log('[Migration] Completata');
};

module.exports = migrate;
