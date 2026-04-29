const { syncMailbox } = require('./imapCrawler');

let schedulerTimer = null;
let running = false;
let db = null;

const syncAllMailboxes = async () => {
  if (running) return;
  running = true;

  try {
    const result = await db.query(
      `SELECT m.*, c.name as client_name 
       FROM mailboxes m 
       LEFT JOIN clients c ON c.id = m.client_id
       WHERE m.active = true AND m.imap_password_encrypted IS NOT NULL`
    );

    const mailboxes = result.rows;
    console.log(`[Scheduler] Syncing ${mailboxes.length} mailboxes...`);

    for (const mailbox of mailboxes) {
      const logResult = await db.query(
        `INSERT INTO sync_log (mailbox_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id`,
        [mailbox.id]
      );
      const logId = logResult.rows[0].id;

      try {
        const synced = await syncMailbox(mailbox, db);
        await db.query(
          `UPDATE sync_log SET status='completed', emails_synced=$1, finished_at=NOW() WHERE id=$2`,
          [synced, logId]
        );
        if (synced > 0) {
          console.log(`[Scheduler] ${mailbox.email}: +${synced} emails`);
          // Trigger batch AV scan per le nuove email
          try {
            const avBatch = require('./avBatchScanner');
            avBatch.runNow(db);
          } catch(e) { /* AV batch non disponibile */ }
        }
      } catch (err) {
        console.error(`[Scheduler] Error syncing ${mailbox.email}:`, err.message);
        await db.query(
          `UPDATE sync_log SET status='error', error=$1, finished_at=NOW() WHERE id=$2`,
          [err.message, logId]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
  } finally {
    running = false;
  }
};

const start = async (database) => {
  db = database;

  // Get interval from settings
  const setting = await db.query("SELECT value FROM settings WHERE key='sync_interval_minutes'");
  const intervalMinutes = parseInt(setting.rows[0]?.value || 15);

  console.log(`[Scheduler] Starting, sync every ${intervalMinutes} minutes`);

  // First sync after 30 seconds
  setTimeout(() => syncAllMailboxes(), 30000);

  // Then every N minutes
  schedulerTimer = setInterval(() => syncAllMailboxes(), intervalMinutes * 60 * 1000);
};

const stop = () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
};

const syncNow = (database) => {
  db = database;
  return syncAllMailboxes();
};

module.exports = { start, stop, syncNow };
