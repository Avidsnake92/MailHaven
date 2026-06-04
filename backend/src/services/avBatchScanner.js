const { simpleParser } = require('mailparser');
const { decompress } = require('./compression');

// Notifica admin per email infetta
const notifyInfected = async (db, emailId, mailboxEmail, viruses, filenames) => {
  try {
    const setting = await db.query("SELECT value FROM settings WHERE key='av_notify_on_infection'");
    if (setting.rows[0]?.value !== 'true') return;
    const { getSmtpConfig, getTransport } = require('./mailer');
    const cfg = await getSmtpConfig(db);
    if (!cfg.host || !cfg.user) return;
    const admins = await db.query("SELECT email FROM users WHERE role='superadmin' AND active=true");
    const transport = getTransport(cfg);
    for (const admin of admins.rows) {
      transport.sendMail({
        from: `"MailHaven AV" <${cfg.from}>`,
        to: admin.email,
        subject: `🚨 [MailHaven] Email infetta rilevata — ${mailboxEmail}`,
        html: `<div style="font-family:sans-serif;max-width:500px">
          <h2 style="color:#dc2626">⚠️ Email infetta rilevata</h2>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Casella</td><td style="padding:8px">${mailboxEmail}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Email ID</td><td style="padding:8px">${emailId}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">Virus</td><td style="padding:8px;color:#dc2626">${viruses.join(', ')}</td></tr>
            <tr><td style="padding:8px;background:#f9fafb;font-weight:bold">File</td><td style="padding:8px">${filenames.join(', ')}</td></tr>
          </table>
          <p>Gli allegati sono stati bloccati. L'email rimane nell'archivio in sola lettura.</p>
          <p style="color:#6b7280;font-size:12px">MailHaven Antivirus</p>
        </div>`,
      }).catch(() => {});
    }
  } catch(e) { console.error('[AV] Notifica errore:', e.message); }
};

let batchTimer = null;
let isRunning = false;

/**
 * Scansiona in batch tutte le email con allegati non ancora scansionate.
 * Gira in background senza bloccare il server.
 */
const runBatchScan = async (db) => {
  if (isRunning) {
    console.log('[AV Batch] Scan già in corso, skip.');
    return;
  }
  isRunning = true;
  console.log('[AV Batch] Avvio scansione batch email non scansionate...');

  try {
    const { scanBuffer } = require('./antivirus');

    // Prendi email con allegati non ancora scansionate, a blocchi di 20
    const CHUNK = 20;
    let offset = 0;
    let totalProcessed = 0;
    let totalInfected = 0;

    let lastId = null;
    while (true) {
      const r = await db.query(
        `SELECT ae.id, ae.raw, m.email as mailbox_email
         FROM archived_emails ae
         JOIN mailboxes m ON m.id = ae.mailbox_id
         WHERE ae.has_attachments = true AND ae.av_status IS NULL AND ae.raw IS NOT NULL
         ${lastId ? 'AND ae.id > $2' : ''}
         ORDER BY ae.id ASC
         LIMIT $1`,
        lastId ? [CHUNK, lastId] : [CHUNK]
      );

      if (r.rows.length === 0) break;
      lastId = r.rows[r.rows.length - 1].id;

      for (const row of r.rows) {
        try {
          const rawBuffer = await decompress(row.raw);
          const parsed = await simpleParser(rawBuffer);
          const attachments = parsed.attachments || [];

          if (attachments.length === 0) {
            await db.query(
              "UPDATE archived_emails SET av_status='clean', has_attachments=false WHERE id=$1",
              [row.id]
            );
            continue;
          }

          // Blocco estensioni pericolose
          const DANGEROUS_EXT = ['.exe','.vbs','.ps1','.bat','.cmd','.scr','.jar','.msi','.com','.pif','.hta','.reg'];
          let allClean = true;
          const infectedViruses = [];
          const infectedFiles = [];

          for (const att of attachments) {
            const fname = (att.filename || '').toLowerCase();
            const ext = fname.substring(fname.lastIndexOf('.'));
            if (DANGEROUS_EXT.includes(ext)) {
              allClean = false;
              infectedViruses.push('DangerousExtension.' + ext.slice(1).toUpperCase());
              infectedFiles.push(att.filename);
              continue;
            }
            // Layer 1: ClamAV
            const clamResult = await scanBuffer(att.content, att.filename);
            if (!clamResult.clean) {
              allClean = false;
              infectedViruses.push(...(clamResult.viruses || ['ClamAV.Unknown']));
              infectedFiles.push(att.filename);
            }
            // Layer 2: YARA rules
            try {
              const { scanBuffer: yaraScan } = require('./yaraScanner');
              const yaraResult = await yaraScan(att.content, att.filename);
              if (!yaraResult.clean && !yaraResult.skipped) {
                allClean = false;
                infectedViruses.push(...(yaraResult.viruses || ['YARA.Unknown']));
                if (!infectedFiles.includes(att.filename)) infectedFiles.push(att.filename);
              }
            } catch(ye) { console.error('[YARA]', ye.message); }
            // Layer 3: VirusTotal (solo se API key configurata)
            if (process.env.VIRUSTOTAL_API_KEY) {
              try {
                const { checkHash } = require('./virustotal');
                const vtResult = await checkHash(att.content, att.filename);
                if (!vtResult.clean && !vtResult.skipped && !vtResult.unknown) {
                  allClean = false;
                  infectedViruses.push(...(vtResult.viruses || ['VT.Unknown']));
                  if (!infectedFiles.includes(att.filename)) infectedFiles.push(att.filename);
                  console.log('[VirusTotal] RILEVATO: ' + att.filename + ' - ' + vtResult.detections);
                }
              } catch(ve) { console.error('[VT]', ve.message); }
            }
            // Scrivi av_log per ogni allegato scansionato
            await db.query(
              `INSERT INTO av_log (email_id, filename, status, viruses) VALUES ($1,$2,$3,$4)`,
              [row.id, att.filename, result.clean ? 'clean' : 'infected', result.viruses || []]
            ).catch(() => {});
          }

          const avStatus = allClean ? 'clean' : 'infected';
          await db.query(
            "UPDATE archived_emails SET av_status=$1 WHERE id=$2",
            [avStatus, row.id]
          );

          if (!allClean) {
            totalInfected++;
            await notifyInfected(db, row.id, row.mailbox_email, infectedViruses, infectedFiles);
            console.log(`[AV Batch] INFETTA: ${row.id} — ${infectedViruses.join(', ')}`);
          }
          totalProcessed++;
        } catch (err) {
          console.error(`[AV Batch] Errore email ${row.id}:`, err.message);
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[AV Batch] Completato: ${totalProcessed} email scansionate, ${totalInfected} infette.`);
  } catch (err) {
    console.error('[AV Batch] Errore batch scan:', err.message);
  } finally {
    isRunning = false;
  }
};

/**
 * Avvia il batch scanner periodico.
 * Di default ogni 10 minuti controlla se ci sono email nuove non scansionate.
 */
const start = (db, intervalMinutes = 10) => {
  if (batchTimer) { clearInterval(batchTimer); }

  // Prima esecuzione dopo 30s dall'avvio (lascia tempo a ClamAV di partire)
  setTimeout(() => runBatchScan(db), 30 * 1000);

  // Poi ogni N minuti
  batchTimer = setInterval(() => runBatchScan(db), intervalMinutes * 60 * 1000);
  console.log(`[AV Batch] Scanner avviato — controllo ogni ${intervalMinutes} minuti.`);
};

const stop = () => {
  if (batchTimer) { clearInterval(batchTimer); batchTimer = null; }
};

// Trigger manuale (chiamato dopo ogni sync IMAP)
const runNow = (db) => runBatchScan(db);

module.exports = { start, stop, runNow };
