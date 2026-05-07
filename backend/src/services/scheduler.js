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
       WHERE m.active = true AND m.imap_password_encrypted IS NOT NULL AND (m.sync_paused IS NULL OR m.sync_paused = false)`
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


// Pulizia automatica sync_log — mantieni solo ultimi 60 giorni
const cleanupOldLogs = async () => {
  try {
    const result = await db.query(
      `DELETE FROM sync_log WHERE started_at < NOW() - INTERVAL '60 days'`
    );
    if (result.rowCount > 0) {
      console.log(`[Scheduler] Pulizia log: eliminati ${result.rowCount} log più vecchi di 60 giorni`);
    }
  } catch (err) {
    console.error('[Scheduler] Errore pulizia log:', err.message);
  }
};

const start = async (database) => {
  db = database;

  // Get interval from settings
  const setting = await db.query("SELECT value FROM settings WHERE key='sync_interval_minutes'");
  const intervalMinutes = parseInt(setting.rows[0]?.value || 15);

  console.log(`[Scheduler] Starting, sync every ${intervalMinutes} minutes`);

  // Pulizia log ogni giorno alle 03:00
  setInterval(() => cleanupOldLogs(), 24 * 60 * 60 * 1000);
  setTimeout(() => cleanupOldLogs(), 5000); // pulizia iniziale

  // Check aggiornamenti ogni 30 minuti (in Node.js, senza bash)
  const runCheckUpdate = () => {
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    // Esegui git fetch e leggi stato
    exec('git -C /root/mailhaven fetch origin main --quiet 2>/dev/null', () => {
      exec('git -C /root/mailhaven rev-parse --short HEAD', (e1, current) => {
        exec('git -C /root/mailhaven rev-parse --short origin/main', (e2, remote) => {
          exec('git -C /root/mailhaven rev-list HEAD..origin/main --count', (e3, behind) => {
            exec('git -C /root/mailhaven log --oneline -5 origin/main', (e4, commits) => {
              const commitList = (commits || '').trim().split('\n').filter(Boolean).map(line => ({
                hash: line.substring(0, 7),
                message: line.substring(8)
              }));
              const status = {
                currentCommit: (current || 'unknown').trim(),
                remoteCommit: (remote || 'unknown').trim(),
                commitsBehind: parseInt((behind || '0').trim()),
                latestCommits: commitList
              };
              try {
                fs.writeFileSync('/app/data/git-status.json', JSON.stringify(status));
              } catch(e) {
                fs.writeFileSync('/app/data/git-status.json', JSON.stringify(status));
              }
            });
          });
        });
      });
    });
  };
  setInterval(runCheckUpdate, 30 * 60 * 1000);
  setTimeout(runCheckUpdate, 10000);

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
