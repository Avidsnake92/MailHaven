-- MailVault Database Schema

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user', -- superadmin, admin, user
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  totp_secret TEXT,
  totp_enabled BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS mailboxes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  imap_host VARCHAR(255),
  imap_port INTEGER DEFAULT 993,
  imap_tls BOOLEAN DEFAULT true,
  imap_user VARCHAR(255),
  imap_password_encrypted TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS user_mailboxes (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, mailbox_id)
);

CREATE TABLE IF NOT EXISTS branding (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) DEFAULT 'MailVault',
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#2563eb',
  secondary_color VARCHAR(7) DEFAULT '#1e40af',
  footer_text VARCHAR(255) DEFAULT 'MailVault - Email Archiving',
  favicon_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default branding
INSERT INTO branding (app_name, primary_color, secondary_color, footer_text)
VALUES ('MailHaven', '#2563eb', '#1e40af', 'MailHaven — Email Archiving')
ON CONFLICT DO NOTHING;

-- Insert default superadmin (password: Admin1234!)
INSERT INTO users (email, password_hash, full_name, role)
VALUES ('admin@mailhaven.local', '$2b$10$X5u0wnjBem7dsC5an566vOi1Ze0mnvySSKJrCehBFtmFY8g/hPNW2', 'Super Admin', 'superadmin')
ON CONFLICT (email) DO NOTHING;

-- S3 Backup configuration
CREATE TABLE IF NOT EXISTS backup_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) DEFAULT 's3',
  endpoint TEXT,
  region VARCHAR(100),
  bucket VARCHAR(255),
  access_key TEXT,
  secret_key_encrypted TEXT,
  prefix VARCHAR(255) DEFAULT 'mailhaven-backup',
  force_path_style BOOLEAN DEFAULT true,
  schedule VARCHAR(50) DEFAULT 'manual',
  enabled BOOLEAN DEFAULT false,
  last_backup_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Backup log
CREATE TABLE IF NOT EXISTS backup_log (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50),
  status VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AV scan log
CREATE TABLE IF NOT EXISTS av_log (
  id SERIAL PRIMARY KEY,
  email_id VARCHAR(255),
  filename VARCHAR(500),
  status VARCHAR(50), -- clean, infected, skipped
  viruses TEXT[],
  scanned_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value) VALUES 
  ('av_notify_on_infection', 'false'),
  ('av_scan_on_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- Spam score cache
CREATE TABLE IF NOT EXISTS spam_cache (
  email_id VARCHAR(255) PRIMARY KEY,
  score NUMERIC,
  is_spam BOOLEAN DEFAULT false,
  subject VARCHAR(500),
  sender_email VARCHAR(255),
  mailbox_email VARCHAR(255),
  path VARCHAR(255),
  sent_at TIMESTAMP,
  analyzed_at TIMESTAMP DEFAULT NOW()
);

-- Archived emails
CREATE TABLE IF NOT EXISTS archived_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_id VARCHAR(500),
  uid INTEGER,
  subject TEXT,
  sender_name VARCHAR(500),
  sender_email VARCHAR(255),
  recipients JSONB DEFAULT '[]',
  cc JSONB DEFAULT '[]',
  bcc JSONB DEFAULT '[]',
  sent_at TIMESTAMP,
  received_at TIMESTAMP DEFAULT NOW(),
  path VARCHAR(255) DEFAULT 'INBOX',
  has_attachments BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',
  raw BYTEA,
  body_html TEXT,
  body_text TEXT,
  headers JSONB DEFAULT '{}',
  spam_score NUMERIC,
  size_bytes INTEGER DEFAULT 0,
  search_vector tsvector,
  UNIQUE(mailbox_id, uid, path)
);

-- Index for full-text search
CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_archived_emails_mailbox ON archived_emails(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_archived_emails_sent_at ON archived_emails(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_emails_sender ON archived_emails(sender_email);
CREATE INDEX IF NOT EXISTS idx_archived_emails_path ON archived_emails(mailbox_id, path);

-- Auto-update search vector
CREATE OR REPLACE FUNCTION update_email_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.sender_email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.sender_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_search_vector_update ON archived_emails;
CREATE TRIGGER email_search_vector_update
  BEFORE INSERT OR UPDATE ON archived_emails
  FOR EACH ROW EXECUTE FUNCTION update_email_search_vector();

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE,
  status VARCHAR(50), -- running, completed, error
  emails_synced INTEGER DEFAULT 0,
  error TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);

-- Sync settings
INSERT INTO settings (key, value) VALUES
  ('sync_interval_minutes', '15'),
  ('sync_enabled', 'true'),
  ('setup_completed', 'false')
ON CONFLICT (key) DO NOTHING;


-- Aggiungi colonna is_restored se non esiste (migration)
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT false;

-- Plugin tokens (longevi, per Outlook/Thunderbird add-in)
CREATE TABLE IF NOT EXISTS plugin_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT 'Plugin Token',
  client_type VARCHAR(50) DEFAULT 'generic',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Colonne OAuth per mailboxes
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_access_token TEXT;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_expires_at TIMESTAMP;

-- Full-text search
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector);

-- Funzione di aggiornamento vettore
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.sender_email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.sender_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_search_vector ON archived_emails;
CREATE TRIGGER trig_search_vector
  BEFORE INSERT OR UPDATE ON archived_emails
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Migrations automatiche
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT 0;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS mailbox_id INTEGER;
ALTER TABLE spam_cache ADD COLUMN IF NOT EXISTS mailbox_id INTEGER;

-- Migrations automatiche — colonne aggiunte nel tempo
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS compressed_size_bytes BIGINT DEFAULT 0;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT false;
ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS av_status VARCHAR(50) DEFAULT 'pending';
