const { syncMailbox } = require('./imapCrawler');
const Imap = require('imap');
const { decrypt } = require('./crypto');

let schedulerTimer = null;
let running = false;
let db = null;

// Elimina email dall'IMAP fisicamente
const deleteFromImap = async (mailbox, uids, folderPath) => {
  // Le caselle OAuth non supportano la cancellazione tramite password — skip
  if (mailbox.oauth_provider && mailbox.oauth_access_token) {
    console.log(`[Policy] ${mailbox.email}: skip deleteFromImap (casella OAuth)`);
    return;
  }
  return new Promise((resolve) => {
    const imap = new Imap({
      user: mailbox.imap_user || mailbox.email,
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
  if (!policy) return;

  // Supporta sia struttura nuova {filter, delete} che vecchia {delete_enabled, delete_mode}
  const del = policy.delete || {};
  const filter = policy.filter || {};

  // Retrocompatibilità struttura vecchia
  const deleteMode = del.mode || (policy.delete_enabled ? policy.delete_mode : 'never') || 'never';
  const deleteDays = del.days || policy.delete_after_days || policy.older_than_days || 30;
  const includeReadOnly = filter.include_unread === false; // se false, archivia solo lette

  if (deleteMode === 'never') return;

  const now = new Date();
  let cutoffDate = null;
  if (deleteMode === 'immediately') cutoffDate = now;
  else if (deleteMode === 'after_days') cutoffDate = new Date(now - deleteDays * 86400000);
  else if (deleteMode === 'older_than') cutoffDate = new Date(now - deleteDays * 86400000);
  if (!cutoffDate) return;

  // Filtro data_from — non archiviare email troppo recenti
  let dateFromCondition = '';
  let dateFromParams = [];
  if (filter.date_from_enabled) {
    if (filter.date_from_type === 'date' && filter.date_from) {
      dateFromCondition = ' AND sent_at >= $4';
      dateFromParams = [new Date(filter.date_from)];
    } else if (filter.date_from_days) {
      dateFromCondition = ' AND sent_at >= $4';
      dateFromParams = [new Date(now - filter.date_from_days * 86400000)];
    }
  }

  // Filtro date_to — non archiviare email più vecchie di una certa data
  let dateToCondition = '';
  let dateToParams = [];
  if (filter.date_to_enabled) {
    const paramIdx = dateFromParams.length > 0 ? '$5' : '$4';
    if (filter.date_to_type === 'date' && filter.date_to) {
      dateToCondition = ` AND sent_at <= ${paramIdx}`;
      dateToParams = [new Date(filter.date_to)];
    } else if (filter.date_to_days) {
      dateToCondition = ` AND sent_at <= ${paramIdx}`;
      dateToParams = [new Date(now - filter.date_to_days * 86400000)];
    }
  }

  // Filtro messaggi segnalati (flagged)
  const flaggedCondition = del.include_flagged ? '' : ' AND (is_flagged = false OR is_flagged IS NULL)';

  try {
    const params = [mailbox.id, cutoffDate, ...dateFromParams, ...dateToParams];
    const emails = await db.query(
      `SELECT id, uid, path FROM archived_emails
       WHERE mailbox_id=$1 AND sent_at<$2 AND is_deleted=false
       ${dateFromCondition}${dateToCondition}${flaggedCondition}
       LIMIT 100`,
      params
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

    // Marca come archiviate da policy — badge permanente
    const allIds = emails.rows.map(e => e.id);
    await db.query(
      `UPDATE archived_emails
       SET is_deleted=true, deleted_at=NOW(),
           badge_type='archived', badge_expires_at=NULL
       WHERE id=ANY($1)`,
      [allIds]
    );

    console.log(`[Policy] ${mailbox.email}: ${emails.rows.length} email archiviate dall'IMAP`);
    return emails.rows.length;
  } catch (e) {
    console.error('[Policy] Errore:', e.message);
    return 0;
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
       WHERE m.active = true 
       AND (m.imap_password_encrypted IS NOT NULL OR m.oauth_access_token IS NOT NULL)
       AND (m.sync_paused IS NULL OR m.sync_paused = false)`
    );
    const mailboxes = result.rows;
    console.log(`[Scheduler] Syncing ${mailboxes.length} mailboxes...`);
    for (const mailbox of mailboxes) {
      const logResult = await db.query(
        `INSERT INTO sync_log (mailbox_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id`,
        [mailbox.id]
      );
      const logId = logResult.rows[0].id;
      const startTime = Date.now();
      try {
        let result;
        if (mailbox.oauth_provider === 'microsoft') {
          const { syncMailbox: graphSync } = require('./graphCrawler');
          result = await graphSync(mailbox, db);
        } else if (mailbox.oauth_provider === 'google') {
          const { syncMailbox: gmailSync } = require('./gmailCrawler');
          result = await gmailSync(mailbox, db);
        } else {
          result = await syncMailbox(mailbox, db);
        }
        const synced = typeof result === 'object' ? result.total : result;
        const folderResults = typeof result === 'object' ? result.folders : [];

        // Conta email eliminate esternamente in questo ciclo
        const extDeleted = await db.query(
          `SELECT COUNT(*) FROM archived_emails
           WHERE mailbox_id=$1 AND badge_type='deleted'
           AND badge_expires_at > NOW() - INTERVAL '10 minutes'`,
          [mailbox.id]
        );

        const durationSec = Math.round((Date.now() - startTime) / 1000);
        const foldersScanned = folderResults.filter(f => !f.skipped).length;
        const foldersSkipped = folderResults.filter(f => f.skipped).length;
        const details = {
          duration_sec: durationSec,
          emails_new: synced,
          emails_archived_policy: 0,
          emails_deleted_external: parseInt(extDeleted.rows[0].count),
          folders: folderResults,
        };

        await db.query(
          `UPDATE sync_log SET status='completed', emails_synced=$1,
           emails_archived=$2, emails_deleted_external=$3,
           folders_scanned=$4, folders_skipped=$5,
           details=$6, finished_at=NOW() WHERE id=$7`,
          [synced, 0, parseInt(extDeleted.rows[0].count),
           foldersScanned, foldersSkipped,
           JSON.stringify(details), logId]
        );
        if (synced > 0) {
          console.log(`[Scheduler] ${mailbox.email}: +${synced} emails`);
          try { const avBatch = require('./avBatchScanner'); avBatch.runNow(db); } catch(e) {}
        }

        // Policy gira DOPO il completamento del ciclo con un delay
        // Evita che le email appena archiviate vengano subito eliminate e riarchiviete
        setTimeout(async () => {
          try {
            const archived = await applyArchivePolicy(mailbox, db);
            if (archived > 0) {
              await db.query(
                `UPDATE sync_log SET emails_archived=$1 WHERE id=$2`,
                [archived, logId]
              );
            }
          } catch(e) { console.error('[Policy]', e.message); }
        }, 10000); // 10 secondi dopo la sync
      } catch (err) {
        console.error(`[Scheduler] Error syncing ${mailbox.email}:`, err.message);
        await db.query(
          `UPDATE sync_log SET status='error', error=$1, finished_at=NOW() WHERE id=$2`,
          [err.message, logId]
        );
        // Notifica email su errore sync — non bloccante
        try {
          const { getSmtpConfig, getTransport } = require('./mailer');
          const cfg = await getSmtpConfig(db);
          if (cfg.host && cfg.user) {
            const admins = await db.query("SELECT email FROM users WHERE role='superadmin' AND active=true");
            const transport = getTransport(cfg);
            for (const admin of admins.rows) {
              transport.sendMail({
                from: `"MailHaven" <${cfg.from}>`,
                to: admin.email,
                subject: `⚠️ [MH-1301] Errore sync — ${mailbox.email}`,
                html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                  <h2 style="color:#dc2626">⚠️ Errore sincronizzazione IMAP</h2>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Casella</td><td style="padding:8px">${mailbox.email}</td></tr>
                    <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Errore</td><td style="padding:8px;color:#dc2626">${err.message}</td></tr>
                    <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Codice</td><td style="padding:8px">MH-1301</td></tr>
                    <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Data/Ora</td><td style="padding:8px">${new Date().toLocaleString('it-IT')}</td></tr>
                  </table>
                  <p>Verifica le credenziali IMAP e la raggiungibilità del server.</p>
                  <p style="color:#6b7280;font-size:12px">MailHaven — Sync Monitor</p>
                </div>`,
              }).catch(() => {});
            }
          }
        } catch (mailErr) { console.error('[Scheduler] Sync notification error:', mailErr.message); }
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

// Pulizia badge scaduti (eliminata/recuperata) — gira ogni notte
const cleanupExpiredBadges = async () => {
  try {
    const r = await db.query(
      `UPDATE archived_emails
       SET badge_type=NULL, badge_expires_at=NULL
       WHERE badge_expires_at IS NOT NULL AND badge_expires_at < NOW()`
    );
    if (r.rowCount > 0) {
      console.log(`[Scheduler] Badge scaduti rimossi: ${r.rowCount}`);
    }
  } catch (err) {
    console.error('[Scheduler] Errore pulizia badge:', err.message);
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
  setInterval(() => cleanupExpiredBadges(), 24 * 60 * 60 * 1000);
  setTimeout(() => cleanupOldLogs(), 5000);
  setTimeout(() => cleanupExpiredBadges(), 8000);

  // check-update.sh viene eseguito dal cron host ogni 30min
  setTimeout(() => syncAllMailboxes(), 30000);

  console.log('IMAP scheduler started');
};

const stop = () => { if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; } };
const runNow = () => syncAllMailboxes();

module.exports = { start, stop, runNow, applyArchivePolicy };
