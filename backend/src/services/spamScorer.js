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

// Valuta fino a `limit` email NON ancora valutate, su tutte le caselle attive
// (più recenti prima), con una pausa tra una e l'altra per non saturare il box.
// Usato dallo scheduler automatico.
const scoreBatch = async (db, limit = 100, pauseMs = 200) => {
  const r = await db.query(
    `SELECT ae.id, ae.raw FROM archived_emails ae
     JOIN mailboxes m ON m.id = ae.mailbox_id
     WHERE ae.mh_spam_score IS NULL AND ae.raw IS NOT NULL AND m.active = true
     ORDER BY ae.sent_at DESC NULLS LAST LIMIT $1`,
    [limit]
  );
  let scored = 0, errors = 0;
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
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { scored, errors, processed: r.rows.length };
};

module.exports = { scoreMailbox, scoreBatch };
