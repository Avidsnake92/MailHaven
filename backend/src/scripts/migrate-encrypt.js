/**
 * Script migrazione: cifra le email già archiviate nel DB
 * Uso: node src/scripts/migrate-encrypt.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const encryptBuffer = (buffer) => {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const result = Buffer.alloc(4 + iv.length + encrypted.length);
  result.writeUInt32BE(iv.length, 0);
  iv.copy(result, 4);
  encrypted.copy(result, 4 + iv.length);
  return result;
};

const isEncrypted = (buf) => {
  try {
    const ivLen = buf.readUInt32BE(0);
    return ivLen === 16 && buf.length > 20 && !(buf[0] === 0x1f && buf[1] === 0x8b);
  } catch { return false; }
};

async function migrate() {
  console.log('=== Migrazione cifratura email ===');
  const total = await pool.query('SELECT COUNT(*) FROM archived_emails WHERE raw IS NOT NULL');
  const count = parseInt(total.rows[0].count);
  console.log(`Email da processare: ${count}`);

  let processed = 0, encrypted = 0, skipped = 0, errors = 0;
  const batchSize = 20;
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
        if (isEncrypted(buf)) { skipped++; processed++; continue; }
        const encryptedBuf = encryptBuffer(buf);
        await pool.query('UPDATE archived_emails SET raw=$1 WHERE id=$2', [encryptedBuf, row.id]);
        encrypted++; processed++;
        if (processed % 50 === 0) console.log(`${processed}/${count} | Cifrati: ${encrypted}`);
      } catch (err) { console.error(`Errore ${row.id}:`, err.message); errors++; processed++; }
    }
    offset += batchSize;
  }

  console.log(`\n✅ Completato: ${encrypted} cifrati, ${skipped} già cifrati, ${errors} errori`);
  await pool.end();
}

migrate().catch(console.error);
