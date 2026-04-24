/**
 * Script di migrazione: comprime tutte le email raw non ancora compresse
 * Uso: node src/scripts/migrate-compress.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  console.log('=== Migrazione compressione email ===');
  const total = await pool.query('SELECT COUNT(*) FROM archived_emails WHERE raw IS NOT NULL');
  const count = parseInt(total.rows[0].count);
  console.log(`Email da processare: ${count}`);

  let processed = 0, compressed = 0, skipped = 0, errors = 0, savedBytes = 0;
  const batchSize = 50;
  let offset = 0;

  while (true) {
    const rows = await pool.query(
      'SELECT id, raw FROM archived_emails WHERE raw IS NOT NULL ORDER BY id LIMIT $1 OFFSET $2',
      [batchSize, offset]
    );
    if (!rows.rows.length) break;

    for (const row of rows.rows) {
      try {
        const buf = Buffer.isBuffer(row.raw) ? row.raw : Buffer.from(row.raw);
        if (buf[0] === 0x1f && buf[1] === 0x8b) { skipped++; processed++; continue; }
        const compressedBuf = await gzip(buf);
        savedBytes += buf.length - compressedBuf.length;
        await pool.query('UPDATE archived_emails SET raw=$1 WHERE id=$2', [compressedBuf, row.id]);
        compressed++; processed++;
        if (processed % 100 === 0) console.log(`${processed}/${count} | Risparmiato: ${(savedBytes/1024/1024).toFixed(2)}MB`);
      } catch (err) { console.error(`Errore ${row.id}:`, err.message); errors++; processed++; }
    }
    offset += batchSize;
  }

  console.log(`\n✅ Completato: ${compressed} compressi, ${skipped} già compressi, ${errors} errori`);
  console.log(`💾 Spazio risparmiato: ${(savedBytes/1024/1024).toFixed(2)}MB`);
  await pool.end();
}

migrate().catch(console.error);
