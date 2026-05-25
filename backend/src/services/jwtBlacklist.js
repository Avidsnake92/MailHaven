/**
 * MailHaven — JWT Token Blacklist
 * Gestisce l'invalidazione dei token al logout
 * Usa PostgreSQL come store persistente (resiste ai riavvii)
 */

// ── Init tabella blacklist ─────────────────────────────────────────────────
const initBlacklist = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS jwt_blacklist (
      jti VARCHAR(255) PRIMARY KEY,
      user_id INTEGER,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires ON jwt_blacklist(expires_at)
  `);
  // Pulizia token scaduti all'avvio
  await db.query(`DELETE FROM jwt_blacklist WHERE expires_at < NOW()`);
  console.log('[JWT Blacklist] Inizializzata');
};

// ── Aggiungi token alla blacklist ──────────────────────────────────────────
const blacklistToken = async (db, jti, userId, expiresAt) => {
  try {
    await db.query(
      `INSERT INTO jwt_blacklist (jti, user_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, userId, new Date(expiresAt * 1000)]
    );
  } catch (e) {
    console.error('[JWT Blacklist] Error blacklisting token:', e.message);
  }
};

// ── Controlla se token è in blacklist ──────────────────────────────────────
const isBlacklisted = async (db, jti) => {
  if (!jti) return false;
  try {
    const r = await db.query(
      'SELECT 1 FROM jwt_blacklist WHERE jti=$1 AND expires_at > NOW()',
      [jti]
    );
    return r.rows.length > 0;
  } catch { return false; }
};

// ── Pulizia periodica token scaduti ───────────────────────────────────────
const startCleanup = (db) => {
  setInterval(async () => {
    try {
      const r = await db.query('DELETE FROM jwt_blacklist WHERE expires_at < NOW()');
      if (r.rowCount > 0) console.log(`[JWT Blacklist] Rimossi ${r.rowCount} token scaduti`);
    } catch (e) { console.error('[JWT Blacklist] Cleanup error:', e.message); }
  }, 60 * 60 * 1000); // ogni ora
};

module.exports = { initBlacklist, blacklistToken, isBlacklisted, startCleanup };
