// Import PST / EML / ZIP-di-EML
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { promisify } = require('util');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { encryptBuffer } = require('../services/crypto');
const { simpleParser } = require('mailparser');
const gzip = promisify(zlib.gzip);

router.use(authMiddleware);
router.use(requireRole('admin', 'superadmin', 'reseller'));
router.use(require('../middleware/audit').auditMiddleware('IMPORT'));

// Gate import: il reseller richiede feat_import; tutti (tranne superadmin) possono
// importare solo nelle PROPRIE caselle. Scrive la risposta d'errore e ritorna false.
const guardImport = async (db, req, res, mailboxId) => {
  if (req.user.role === 'reseller') {
    const f = (await db.query('SELECT feat_import FROM resellers WHERE id=$1', [req.user.reseller_id])).rows[0];
    if (!f?.feat_import) { res.status(403).json({ error: 'Funzione non abilitata per questo rivenditore', code: 'MH-1003' }); return false; }
  }
  if (req.user.role === 'superadmin') return true;
  const m = (await db.query('SELECT m.client_id, c.reseller_id FROM mailboxes m LEFT JOIN clients c ON c.id=m.client_id WHERE m.id=$1', [mailboxId])).rows[0];
  if (!m) { res.status(404).json({ error: 'Casella non trovata' }); return false; }
  const ok = req.user.role === 'reseller'
    ? (m.reseller_id != null && m.reseller_id === req.user.reseller_id)
    : (m.client_id != null && m.client_id === req.user.client_id);
  if (!ok) { res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' }); return false; }
  return true;
};

const upload = multer({
  dest: '/tmp/mh_import/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pst', '.eml', '.zip', '.mbox'].includes(ext)) return cb(null, true);
    cb(new Error('Formato non supportato. Usa .pst, .eml, .zip o .mbox'));
  },
});

const sanitizeText = (str) => {
  if (str == null) return null;
  if (typeof str !== 'string') { try { str = String(str); } catch { return null; } }
  return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const insertEmail = async (db, mailboxId, rawBuffer, folderPath, overwrite = false) => {
  const parsed = await simpleParser(rawBuffer);
  const msgId = parsed.messageId || null;

  // Deduplication
  if (msgId) {
    const ex = await db.query(
      'SELECT id FROM archived_emails WHERE mailbox_id=$1 AND message_id=$2 LIMIT 1',
      [mailboxId, msgId]
    );
    if (ex.rows.length > 0 && !overwrite) return { skipped: true };
  }

  const rawGzipped = await gzip(rawBuffer);
  const rawEncrypted = encryptBuffer(rawGzipped);

  const attachments = (parsed.attachments || []).map(a => ({
    filename: a.filename || 'attachment',
    contentType: a.contentType,
    size: a.size || 0,
  }));

  const headers = {};
  parsed.headers.forEach((val, key) => {
    headers[key] = Array.isArray(val) ? val.join(', ') : String(val);
  });

  const parseAddr = (addr) => {
    if (!addr) return [];
    const list = Array.isArray(addr.value) ? addr.value : [addr.value];
    return list.filter(Boolean).map(a => ({ name: a.name || '', email: a.address || '' }));
  };

  const sentAt = parsed.date && !isNaN(new Date(parsed.date).getTime())
    ? new Date(parsed.date) : new Date();

  // UID stabile da message_id
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(msgId || (rawBuffer.slice(0, 64).toString('hex'))).digest();
  const uid = h.readInt32BE(0);

  await db.query(
    `INSERT INTO archived_emails
     (mailbox_id, uid, message_id, subject, sender_name, sender_email,
      recipients, cc, bcc, sent_at, path, has_attachments, attachments,
      raw, body_html, body_text, headers, size_bytes, compressed_size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (mailbox_id, uid, path) DO NOTHING`,
    [
      mailboxId, uid, msgId,
      sanitizeText(parsed.subject) || '(senza oggetto)',
      sanitizeText(parsed.from?.value?.[0]?.name),
      parsed.from?.value?.[0]?.address || null,
      JSON.stringify(parseAddr(parsed.to)),
      JSON.stringify(parseAddr(parsed.cc)),
      JSON.stringify(parseAddr(parsed.bcc)),
      sentAt, folderPath || 'Importata',
      attachments.length > 0,
      JSON.stringify(attachments),
      rawEncrypted,
      sanitizeText(parsed.html),
      sanitizeText(parsed.text),
      JSON.stringify(headers),
      rawBuffer.length,
      rawGzipped.length,
    ]
  );
  return { inserted: true };
};

// POST /api/import/eml ??? importa singolo file EML
router.post('/eml', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, folder = 'Importata' } = req.body;
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  if (!mailbox_id) return res.status(400).json({ error: 'mailbox_id richiesto' });
  if (!(await guardImport(db, req, res, parseInt(mailbox_id)))) return;
  try {
    const raw = fs.readFileSync(req.file.path);
    const result = await insertEmail(db, parseInt(mailbox_id), raw, folder);
    res.json({ ...result, message: result.skipped ? 'Email gi?? presente' : 'Email importata' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// POST /api/import/zip ??? importa ZIP di file EML
router.post('/zip', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, folder = 'Importata' } = req.body;
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  if (!mailbox_id) return res.status(400).json({ error: 'mailbox_id richiesto' });
  if (!(await guardImport(db, req, res, parseInt(mailbox_id)))) return;

  const AdmZip = require('adm-zip');
  let inserted = 0, skipped = 0, errors = 0;
  const errorList = [];

  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.endsWith('.eml'));
    const total = entries.length;

    for (const entry of entries) {
      try {
        const raw = entry.getData();
        // Usa il percorso dentro lo zip come folder se non specificato
        const entryFolder = folder !== 'Importata' ? folder :
          (path.dirname(entry.entryName) !== '.' ? path.dirname(entry.entryName) : 'Importata');
        const result = await insertEmail(db, parseInt(mailbox_id), raw, entryFolder);
        if (result.skipped) skipped++;
        else inserted++;
      } catch (e) {
        errors++;
        errorList.push({ file: entry.entryName, error: e.message });
      }
    }
    res.json({ total, inserted, skipped, errors, errorList: errorList.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// POST /api/import/mbox ??? importa file MBOX
router.post('/mbox', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, folder = 'Importata' } = req.body;
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  if (!mailbox_id) return res.status(400).json({ error: 'mailbox_id richiesto' });
  if (!(await guardImport(db, req, res, parseInt(mailbox_id)))) return;

  let inserted = 0, skipped = 0, errors = 0;
  try {
    const content = fs.readFileSync(req.file.path);
    const mboxStr = content.toString('binary');
    // Split by "From " lines (MBOX format separator)
    const messages = mboxStr.split(/^From .+$/m).filter(m => m.trim());

    for (const msg of messages) {
      try {
        const raw = Buffer.from(msg.trim(), 'binary');
        if (raw.length < 10) continue;
        const result = await insertEmail(db, parseInt(mailbox_id), raw, folder);
        if (result.skipped) skipped++;
        else inserted++;
      } catch (e) {
        errors++;
      }
    }
    res.json({ total: messages.length, inserted, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// POST /api/import/pst ??? importa file PST (Outlook)
router.post('/pst', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  if (!mailbox_id) return res.status(400).json({ error: 'mailbox_id richiesto' });
  if (!(await guardImport(db, req, res, parseInt(mailbox_id)))) return;

  let inserted = 0, skipped = 0, errors = 0;
  const errorList = [];

  try {
    const PSTFile = require('pst-extractor').PSTFile;
    const pst = new PSTFile(req.file.path);

    const processFolder = async (folder, folderPath = '') => {
      if (folder.hasSubfolders) {
        const subFolders = folder.getSubFolders();
        for (const subFolder of subFolders) {
          const subPath = folderPath ? `${folderPath}/${subFolder.displayName}` : subFolder.displayName;
          await processFolder(subFolder, subPath);
        }
      }
      if (folder.contentCount > 0) {
        let email = folder.getNextChild();
        while (email !== null) {
          try {
            if (email.messageClass === 'IPM.Note' || email.messageClass?.startsWith('IPM.Note')) {
              // Costruisci EML grezzo dal PST
              const from = email.senderEmailAddress || '';
              const to = email.displayTo || '';
              const subject = email.subject || '';
              const date = email.messageDeliveryTime || email.clientSubmitTime || new Date();
              const body = email.body || email.bodyHTML || '';
              const isHtml = !!email.bodyHTML;

              const rawEml = [
                `From: ${email.senderName ? `"${email.senderName}" <${from}>` : from}`,
                `To: ${to}`,
                `Subject: ${subject}`,
                `Date: ${date instanceof Date ? date.toUTCString() : new Date(date).toUTCString()}`,
                `Message-ID: <pst-${Date.now()}-${Math.random().toString(36).slice(2)}@import>`,
                `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
                ``,
                body,
              ].join('\r\n');

              const result = await insertEmail(
                db, parseInt(mailbox_id),
                Buffer.from(rawEml, 'utf8'),
                folderPath || 'PST Importato'
              );
              if (result.skipped) skipped++;
              else inserted++;
            }
          } catch (e) {
            errors++;
            errorList.push({ folder: folderPath, error: e.message });
          }
          email = folder.getNextChild();
        }
      }
    };

    const rootFolder = pst.getRootFolder();
    await processFolder(rootFolder, '');
    pst.close?.();

    res.json({ inserted, skipped, errors, errorList: errorList.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
module.exports.insertEmail = insertEmail;

