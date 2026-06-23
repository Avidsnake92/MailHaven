const migrate = async (db) => {
  const run = async (sql) => { try { await db.query(sql); } catch(e) { console.warn('[Migration] Skip:', e.message.split('\n')[0]); } };

  // UID overflow fix: INTEGER max 2.1B, readUInt32BE produce valori fino 4.3B
  await run(`ALTER TABLE archived_emails ALTER COLUMN uid TYPE BIGINT`);
  await run(`ALTER TABLE archived_emails ALTER COLUMN uid SET NOT NULL`);
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

  // Colonne profilo utente
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Europe/Rome'`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'it'`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT NULL`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL`);

  // Tabella sessioni attive per concurrent session control
  await run(`CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    jti VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB DEFAULT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`);

  // Tabella log rotazione chiave
  await run(`CREATE TABLE IF NOT EXISTS key_rotation_log (
    id SERIAL PRIMARY KEY,
    performed_by INTEGER REFERENCES users(id),
    performed_at TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45)
  )`);

  // JWT Blacklist per token revocation al logout
  await run(`CREATE TABLE IF NOT EXISTS jwt_blacklist (
    jti VARCHAR(255) PRIMARY KEY,
    user_id INTEGER,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires ON jwt_blacklist(expires_at)`);

  // Plugin tokens (Outlook/Thunderbird) - tabella mancante su installazioni esistenti
  await run(`CREATE TABLE IF NOT EXISTS plugin_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL DEFAULT 'Plugin Token',
    client_type VARCHAR(50) DEFAULT 'generic',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_tokens_user ON plugin_tokens(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_plugin_tokens_token ON plugin_tokens(token)`);


  // Badge temporizzati
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS badge_type VARCHAR(20) DEFAULT NULL`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS badge_expires_at TIMESTAMP DEFAULT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_badge_expires ON archived_emails(badge_expires_at) WHERE badge_expires_at IS NOT NULL`);
  await run(`INSERT INTO settings (key, value) VALUES ('badge_duration_days', '30') ON CONFLICT (key) DO NOTHING`);

  // Colonne extra sync_log per dettagli operazioni
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS emails_archived INTEGER DEFAULT 0`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS emails_deleted_external INTEGER DEFAULT 0`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT NULL`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS folders_scanned INTEGER DEFAULT 0`);
  await run(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS folders_skipped INTEGER DEFAULT 0`);

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
          const rawDates = [
            headers['date'], headers['Date'], headers['DATE'],
            headers['received'], headers['Received'],
          ];
          let fixedDate = null;
          for (const raw of rawDates) {
            if (!raw) continue;
            const str = Array.isArray(raw) ? raw[0] : String(raw);
            const candidates = [str];
            const match = str.match(/;\s*(.+)$/);
            if (match) candidates.push(match[1].trim());
            for (const candidate of candidates) {
              const d = new Date(candidate);
              if (!isNaN(d.getTime()) && d.getFullYear() > 1970 && d.getFullYear() < 2100) {
                fixedDate = d; break;
              }
            }
            if (fixedDate) break;
          }
          if (fixedDate) {
            await db.query(`UPDATE archived_emails SET sent_at=$1 WHERE id=$2`, [fixedDate, row.id]);
            fixed++;
          }
        } catch {}
      }
      console.log(`[Migration] Fix date 1970: ${fixed}/${bad.rows.length} email corrette`);
    }
  } catch (e) {
    console.warn('[Migration] Fix date 1970 skip:', e.message);
  }


  // Auto-mark setup_completed se esiste gia un superadmin (aggiornamento da versione vecchia)
  try {
    const sc = await db.query("SELECT value FROM settings WHERE key='setup_completed'");
    if (!sc.rows[0] || sc.rows[0].value !== 'true') {
      const sa = await db.query("SELECT id FROM users WHERE role='superadmin' AND active=true LIMIT 1");
      if (sa.rows.length > 0) {
        await db.query("INSERT INTO settings (key,value) VALUES ('setup_completed','true') ON CONFLICT (key) DO UPDATE SET value='true'");
        console.log('[Migration] setup_completed recuperato automaticamente (superadmin esistente)');
      }
    }
  } catch(e) { console.warn('[Migration] setup_completed check skip:', e.message); }


  // Legal Hold ??? conservazione a norma di legge
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS legal_hold_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await run(`ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS legal_hold_at TIMESTAMP`);
  await run(`CREATE INDEX IF NOT EXISTS idx_archived_emails_legal_hold ON archived_emails(legal_hold) WHERE legal_hold = true`);

  // Quote per cliente (MSP) — NULL = illimitato
  await run(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS quota_bytes BIGINT DEFAULT NULL`);
  await run(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_mailboxes INTEGER DEFAULT NULL`);
  await run(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT NULL`);

  // Reseller (MSP multi-livello) — pacchetto venduto al rivenditore (NULL = illimitato)
  await run(`CREATE TABLE IF NOT EXISTS resellers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    quota_bytes BIGINT DEFAULT NULL,
    max_mailboxes INTEGER DEFAULT NULL,
    max_users INTEGER DEFAULT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  // Feature attivabili a pacchetto per il reseller (default off)
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_legal_hold BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_import BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_logs BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_backup BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_antivirus BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS feat_antispam BOOLEAN DEFAULT false`);
  // Un cliente può appartenere a un reseller (NULL = cliente diretto del superadmin)
  await run(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL`);
  // L'utente di login 'reseller' è legato alla sua riga resellers
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_clients_reseller ON clients(reseller_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_reseller ON users(reseller_id)`);
  // Backup per-reseller: config e log possono appartenere a un reseller (NULL = globale/superadmin)
  await run(`ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE CASCADE`);
  await run(`ALTER TABLE backup_log ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE CASCADE`);

    console.log('[Migration] Completata');

};

module.exports = migrate;
