const { syncMailbox } = require('./imapCrawler');
const Imap = require('imap');
const { decrypt } = require('./crypto');

let schedulerTimer = null;
let running = false;
let db = null;

// Elimina email dall'IMAP fisicamente
const deleteFromImap = async (mailbox, uids, folderPath) => {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: mailbox.imap_user,
      password: decrypt(mailbox.imap_password_encrypted),
      host: mailbox.imap_host,
      port: mailbox.imap_port || 993,
      tls: mailbox.imap_tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
    });
    const timeout = setTimeout(() => { try { imap.destroy(); } catch(e) {} resolve(); }, 20000);
    imap.once('ready', () => {
      imap.openBox(folderPath, false, (err) => {
        if (err) { clearTimeout(timeout); imap.end(); resolve(); return; }
        imap.addFlags(uids, '\\Deleted', (err) => {
          if (err) { clearTimeout(timeout); imap.end(); resolve(); return; }
          imap.expunge((err) => {
            clearTimeout(timeout);
            imap.end();
            resolve();
          });
        });
      });
    });
    imap.once('end', () => { clearTimeout(timeout); resolve(); });
    imap.once('error', () => { clearTimeout(timeout); resolve(); });
    imap.connect();
  });
};

// Applica policy archiviazione — elimina dall'IMAP, mantieni in MailHaven
const applyArchivePolicy = async (mailbox, db) => {
  const policy = mailbox.archive_policy;
  if (!policy || !policy.delete_enabled) return;
  const mode = policy.delete_mode || 'never';
  if (mode === 'never') return;

  let cutoffDate = null;
  const now = new Date();
  if (mode === 'immediately') cutoffDate = now;
  else if (mode === 'after_days') cutoffDate = new Date(now - (parseInt(policy.delete_after_days) || 30) * 86400000);
  else if (mode === 'older_than') cutoffDate = new Date(now - (parseInt(policy.older_than_days) || 90) * 86400000);
  if (!cutoffDate) return;

  const activatedAt = policy.activated_at ? new Date(policy.activated_at) : new Date(0);

  try {
    // Trova email da eliminare — solo quelle archiviate DOPO l'attivazione della policy
    const emails = await db.query(
      `SELECT id, uid, path FROM archived_emails 
       WHERE mailbox_id=$1 AND sent_at<$2 AND is_deleted=false 
       AND received_at >= $3 LIMIT 100`,
      [mailbox.id, cutoffDate, activatedAt]
    );
    if (!emails.rows.length) return;

    // Raggruppa per cartella
    const byFolder = {};
    emails.rows.forEach(e => {
      if (!byFolder[e.path]) byFolder[e.path] = { uids: [], ids: [] };
      byFolder[e.path].uids.push(e.uid);
      byFolder[e.path].ids.push(e.id);
    });

    // Elimina dall'IMAP per ogni cartella
    for (const [folder, data] of Object.entries(byFolder)) {
      await deleteFromImap(mailbox, data.uids, folder);
    }

    // Marca come eliminate in MailHaven (mantieni nell'archivio)
    const allIds = emails.rows.map(e => e.id);
    await db.query(
      'UPDATE archived_emails SET is_deleted=true, deleted_at=NOW() WHERE id=ANY($1)',
      [allIds]
    );

    console.log(`[Policy] ${mailbox.email}: ${emails.rows.length} email eliminate dall'IMAP`);
  } catch (e) {
    console.error('[Policy] Errore:', e.message);
  }
};

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
        await applyArchivePolicy(mailbox, db).catch(e => console.error('[Policy]', e.message));
        await db.query(
          `UPDATE sync_log SET status='completed', emails_synced=$1, finished_at=NOW() WHERE id=$2`,
          [synced, logId]
        );
        if (synced > 0) {
          console.log(`[Scheduler] ${mailbox.email}: +${synced} emails`);
          try { const avBatch = require('./avBatchScanner'); avBatch.runNow(db); } catch(e) {}
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

const cleanupOldLogs = async () => {
  try {
    await db.query(`DELETE FROM sync_log WHERE started_at < NOW() - INTERVAL '30 days'`);
    await db.query(`DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '90 days'`);
  } catch (err) {
    console.error('[Scheduler] Errore pulizia log:', err.message);
  }
};

const start = async (database) => {
  db = database;
  const setting = await db.query("SELECT value FROM settings WHERE key='sync_interval_minutes'");
  const intervalMinutes = parseInt(setting.rows[0]?.value || 15);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Scheduler] Starting, sync every ${intervalMinutes} minutes`);

  schedulerTimer = setInterval(() => syncAllMailboxes(), intervalMs);
  setInterval(() => cleanupOldLogs(), 24 * 60 * 60 * 1000);
  setTimeout(() => cleanupOldLogs(), 5000);

  const runCheckUpdate = () => {
    const { exec } = require('child_process');
    exec('bash /root/mailhaven/check-update.sh', (err) => {
      if (err) console.log('[Scheduler] check-update skip: ' + err.message.split('\n')[0]);
    });
  };
  setInterval(runCheckUpdate, 30 * 60 * 1000);
  setTimeout(runCheckUpdate, 10000);
  setTimeout(() => syncAllMailboxes(), 30000);

  console.log('IMAP scheduler started');
};

const stop = () => { if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; } };
const runNow = () => syncAllMailboxes();

module.exports = { start, stop, runNow };
