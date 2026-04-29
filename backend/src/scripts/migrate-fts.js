/**
 * Popola search_vector per le email già archiviate
 * Uso: node src/scripts/migrate-fts.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  console.log('=== Migrazione Full-Text Search ===');
  
  // Crea trigger se non esiste
  await pool.query(`
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
  `);
  
  await pool.query(`
    DROP TRIGGER IF EXISTS trig_search_vector ON archived_emails;
    CREATE TRIGGER trig_search_vector
      BEFORE INSERT OR UPDATE ON archived_emails
      FOR EACH ROW EXECUTE FUNCTION update_search_vector();
  `);

  // Aggiungi colonna se non esiste
  await pool.query('ALTER TABLE archived_emails ADD COLUMN IF NOT EXISTS search_vector tsvector');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_archived_emails_search ON archived_emails USING GIN(search_vector)');

  // Aggiorna email esistenti
  const total = await pool.query('SELECT COUNT(*) FROM archived_emails WHERE search_vector IS NULL');
  const count = parseInt(total.rows[0].count);
  console.log(`Email da indicizzare: ${count}`);

  let processed = 0;
  while (true) {
    const r = await pool.query(`
      UPDATE archived_emails SET
        search_vector = setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
                        setweight(to_tsvector('simple', coalesce(sender_email, '')), 'B') ||
                        setweight(to_tsvector('simple', coalesce(sender_name, '')), 'B') ||
                        setweight(to_tsvector('simple', coalesce(body_text, '')), 'C')
      WHERE id IN (
        SELECT id FROM archived_emails WHERE search_vector IS NULL LIMIT 100
      )
    `);
    processed += r.rowCount;
    if (r.rowCount === 0) break;
    console.log(`Indicizzate: ${processed}/${count}`);
  }

  console.log(`\n✅ Completato: ${processed} email indicizzate`);
  await pool.end();
}

migrate().catch(console.error);
