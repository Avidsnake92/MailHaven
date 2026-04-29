const { simpleParser } = require('mailparser');
const { decompress } = require('./compression');

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

    while (true) {
      const r = await db.query(
        `SELECT id, raw FROM archived_emails
         WHERE has_attachments = true AND av_status IS NULL AND raw IS NOT NULL
         ORDER BY sent_at DESC
         LIMIT $1 OFFSET $2`,
        [CHUNK, offset]
      );

      if (r.rows.length === 0) break;

      for (const row of r.rows) {
        try {
          const rawBuffer = await decompress(row.raw);
          const parsed = await simpleParser(rawBuffer);
          const attachments = parsed.attachments || [];

          if (attachments.length === 0) {
            // Nessun allegato effettivo nel raw — aggiorna has_attachments
            await db.query(
              "UPDATE archived_emails SET av_status='clean', has_attachments=false WHERE id=$1",
              [row.id]
            );
            continue;
          }

          let allClean = true;
          for (const att of attachments) {
            const result = await scanBuffer(att.content, att.filename);
            if (!result.clean) { allClean = false; break; }
          }

          await db.query(
            "UPDATE archived_emails SET av_status=$1 WHERE id=$2",
            [allClean ? 'clean' : 'infected', row.id]
          );

          if (!allClean) totalInfected++;
          totalProcessed++;
        } catch (err) {
          console.error(`[AV Batch] Errore email ${row.id}:`, err.message);
          // Non bloccare il batch per un errore singolo
        }
      }

      offset += CHUNK;
      // Piccola pausa tra chunk per non martellare ClamAV
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
