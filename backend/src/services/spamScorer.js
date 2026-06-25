// Batch scorer antispam (Rspamd) — assegna mh_spam_score alle email archiviate
// che non lo hanno ancora. Modellato su avBatchScanner.
const { decompress } = require('./compression');
const { checkSpam } = require('./rspamdClient');

const CHUNK = 50;

// Calcola il punteggio MailHaven per tutte le email di una casella senza mh_spam_score.
const scoreMailbox = async (db, mailboxId, onProgress) => {
  let lastId = null, scored = 0, errors = 0;
  while (true) {
    const r = await db.query(
      `SELECT id, raw FROM archived_emails
       WHERE mailbox_id=$1 AND mh_spam_score IS NULL AND raw IS NOT NULL
       ${lastId ? 'AND id > $3' : ''}
       ORDER BY id ASC LIMIT $2`,
      lastId ? [mailboxId, CHUNK, lastId] : [mailboxId, CHUNK]
    );
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;
    for (const row of r.rows) {
      try {
        const raw = await decompress(row.raw);
        const res = await checkSpam(raw);
        await db.query(
          'UPDATE archived_emails SET mh_spam_score=$1, mh_spam_action=$2, mh_spam_symbols=$3, mh_spam_at=NOW() WHERE id=$4',
          [res.score, res.action, JSON.stringify(res.symbols), row.id]
        );
        scored++;
      } catch (e) { errors++; }
    }
    onProgress && onProgress(scored);
  }
  return { scored, errors };
};

module.exports = { scoreMailbox };
