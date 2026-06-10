const express = require('express');
const { ERRORS, AppError } = require('../errors');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getSpamInfo } = require('../services/antivirus');
const { simpleParser } = require('mailparser');
const { decompress } = require('../services/compression');
const archiver = require('archiver');

router.use(authMiddleware);

// Helper: get mailbox IDs accessible by user
const getUserMailboxIds = async (db, user) => {
  if (user.role === 'superadmin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE active=true');
    return r.rows.map(r => r.id);
  }
  if (user.role === 'admin') {
    const r = await db.query(
      'SELECT id FROM mailboxes WHERE client_id=$1 AND active=true',
      [user.client_id]
    );
    return r.rows.map(r => r.id);
  }
  // Regular user — get assigned mailboxes
  const r = await db.query(
    `SELECT m.id FROM mailboxes m
     JOIN user_mailboxes um ON um.mailbox_id = m.id
     WHERE um.user_id = $1 AND m.active = true`,
    [user.id]
  );
  return r.rows.map(r => r.id);
};


// GET /emails/storage — statistiche spazio per casella
router.get('/storage', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id } = req.query;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    let filter = 'WHERE ae.mailbox_id=ANY($1)';
    let params = [ids];
    if (mailbox_id) {
      const mid = parseInt(mailbox_id);
      if (!ids.includes(mid)) return res.status(403).json({ error: 'Accesso negato' });
      filter = 'WHERE ae.mailbox_id=$1';
      params = [mid];
    }
    const r = await db.query(
      `SELECT
        COUNT(*) as email_count,
        SUM(ae.size_bytes) as original_bytes,
        COALESCE(SUM(ae.compressed_size_bytes), SUM(LENGTH(ae.raw))) as compressed_bytes
       FROM archived_emails ae
       ${filter}`,
      params
    );
    const row = r.rows[0];
    const original = parseInt(row.original_bytes || 0);
    const compressed = parseInt(row.compressed_bytes || 0);
    const saved = original - compressed;
    const ratio = original > 0 ? Math.round((saved / original) * 100) : 0;

    // Quota IMAP dal server (se mailbox_id specificato)
    let imap_quota = null;
    if (mailbox_id) {
      try {
        const mbR = await db.query(
          'SELECT * FROM mailboxes WHERE id=$1 AND active=true', [mailbox_id]
        );
        if (mbR.rows[0]) {
          const mb = mbR.rows[0];
          const { decrypt } = require('../services/crypto');
          const Imap = require('imap');
          imap_quota = await new Promise((resolve) => {
            const imap = new Imap({
              user: mb.imap_user || mb.email,
              password: decrypt(mb.imap_password_encrypted),
              host: mb.imap_host,
              port: mb.imap_port || 993,
              tls: mb.imap_tls !== false,
              tlsOptions: { rejectUnauthorized: false },
              connTimeout: 8000,
              authTimeout: 5000,
            });
            imap.once('ready', () => {
              // Prima prova GETQUOTA
              imap.getQuotaRoot('INBOX', (err, quotaRoots, quotas) => {
                if (!err && quotas) {
                  const root = Object.values(quotas)[0];
                  if (root?.storage) {
                    imap.end();
                    return resolve({
                      used_bytes: root.storage.usage * 1024,
                      limit_bytes: root.storage.limit * 1024,
                      percent: root.storage.limit > 0
                        ? Math.round((root.storage.usage / root.storage.limit) * 100)
                        : null
                    });
                  }
                }
                // Fallback: usa STATUS per contare messaggi e dimensione
                imap.status('INBOX', (err2, box) => {
                  imap.end();
                  if (err2 || !box) return resolve(null);
                  resolve({
                    used_bytes: box.messages?.total ? box.messages.total * 50 * 1024 : null,
                    limit_bytes: null,
                    percent: null,
                    messages_total: box.messages?.total || 0,
                    messages_unseen: box.messages?.unseen || 0,
                  });
                });
              });
            });
            imap.once('error', () => resolve(null));
            imap.connect();
          });
        }
      } catch (e) { imap_quota = null; }
    }

    res.json({
      email_count: parseInt(row.email_count || 0),
      original_bytes: original,
      compressed_bytes: compressed,
      saved_bytes: saved,
      compression_ratio: ratio,
      imap_quota,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /emails/global-search — ricerca full-text su tutte le caselle accessibili
router.get('/global-search', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { search, page = 1, limit = 30, from_date, to_date } = req.query;
  if (!search || search.trim().length < 2) return res.status(400).json({ error: 'Query troppo corta (min 2 caratteri)', code: 'MH-1406' });
  const offset = Math.max(0, (parseInt(page) - 1) * parseInt(limit));
  try {
    let mailboxFilter = '';
    let extraParams = [];
    if (req.user.role !== 'superadmin') {
      const mbR = await db.query(
        `SELECT m.id FROM mailboxes m
         LEFT JOIN user_mailboxes um ON um.mailbox_id = m.id
         WHERE m.active=true AND (um.user_id=$1 OR m.client_id IN (
           SELECT client_id FROM users WHERE id=$1
         ))`,
        [req.user.id]
      );
      const ids = mbR.rows.map(r => r.id);
      if (!ids.length) return res.json({ items: [], total: 0, totalPages: 0, page: 1 });
      mailboxFilter = `AND ae.mailbox_id = ANY($${extraParams.length + 3}::int[])`;
      extraParams = [ids];
    }

    let conditions = [`ae.search_vector @@ plainto_tsquery('simple', $1)`];
    let params = [search, parseInt(limit)];
    if (from_date) { conditions.push(`ae.sent_at >= $${params.length + 1}`); params.push(from_date); }
    if (to_date)   { conditions.push(`ae.sent_at <= $${params.length + 1}`); params.push(to_date); }
    if (extraParams.length) params.push(...extraParams);

    const where = conditions.join(' AND ') + (mailboxFilter ? ` ${mailboxFilter}` : '');

    const [items, count] = await Promise.all([
      db.query(`
        SELECT ae.id, ae.subject, ae.sender_name, ae.sender_email, ae.sent_at,
               ae.path, ae.has_attachments, ae.is_deleted, ae.is_restored,
               ae.badge_type, ae.mailbox_id, m.email as mailbox_email,
               ts_headline('simple', COALESCE(ae.body_text,''), plainto_tsquery('simple', $1),
                 'MaxFragments=1, MaxWords=15, MinWords=5') as snippet
        FROM archived_emails ae
        JOIN mailboxes m ON m.id = ae.mailbox_id
        WHERE ${where}
        ORDER BY ts_rank(ae.search_vector, plainto_tsquery('simple', $1)) DESC, ae.sent_at DESC
        LIMIT $2 OFFSET ${offset}
      `, params),
      db.query(`SELECT COUNT(*) FROM archived_emails ae WHERE ${where}`, params),
    ]);

    res.json({
      items: items.rows.map(e => ({
        id: e.id, subject: e.subject, senderName: e.sender_name,
        senderEmail: e.sender_email, sentAt: e.sent_at, path: e.path,
        hasAttachments: e.has_attachments, isDeleted: e.is_deleted,
        isRestored: e.is_restored, badgeType: e.badge_type,
        mailboxId: e.mailbox_id, mailboxEmail: e.mailbox_email,
        snippet: e.snippet,
      })),
      total: parseInt(count.rows[0].count),
      totalPages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit)),
      page: parseInt(page),
    });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// GET /emails — list emails with filters
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, path, search, date_from, date_to, page = 1, limit = 50, show_restored = 'false', show_deleted = 'false', fulltext = 'false', sort_by = 'sent_at', sort_dir = 'desc' } = req.query;
  const ALLOWED_SORT = ['sent_at', 'subject', 'sender_email'];
  const safeSortBy = ALLOWED_SORT.includes(sort_by) ? `ae.${sort_by}` : 'ae.sent_at';
  const safeSortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';
  const offset = Math.max(0, (parseInt(page) - 1) * parseInt(limit));

  try {
    const accessibleIds = await getUserMailboxIds(db, req.user);
    if (!accessibleIds.length) return res.json({ items: [], total: 0, totalPages: 0 });

    const conditions = ['ae.mailbox_id = ANY($1)'];
    const params = [accessibleIds];
    let p = 2;

    if (mailbox_id) {
      const mid = parseInt(mailbox_id);
      if (!accessibleIds.includes(mid)) return res.status(403).json({ error: 'Accesso negato' });
      conditions.push(`ae.mailbox_id = $${p++}`);
      params.push(mid);
    }

    // Nascondi email restore di default
    if (show_restored !== 'true') {
      conditions.push('ae.is_restored = false');
    }
    // Nascondi email eliminate di default
    if (show_deleted !== 'true') {
      conditions.push('(ae.is_deleted = false OR ae.is_deleted IS NULL)');
    }

    if (path && path !== 'ALL') {
      conditions.push(`ae.path = $${p++}`);
      params.push(path);
    }

    if (search) {
      conditions.push(`ae.search_vector @@ plainto_tsquery('simple', $${p++})`);
      params.push(search);
    }

    if (date_from) { conditions.push(`ae.sent_at >= $${p++}`); params.push(date_from); }
    if (date_to) { conditions.push(`ae.sent_at <= $${p++}`); params.push(date_to); }

    const where = conditions.join(' AND ');

    const [countResult, emailResult] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM archived_emails ae WHERE ${where}`, params),
      db.query(
        `SELECT ae.id, ae.subject, ae.sender_name, ae.sender_email,
                ae.sent_at, ae.path, ae.has_attachments, ae.spam_score, ae.is_restored, ae.av_status, ae.is_deleted,
                ae.mailbox_id, m.email as mailbox_email, ae.badge_type, ae.badge_expires_at
         FROM archived_emails ae
         JOIN mailboxes m ON m.id = ae.mailbox_id
         WHERE ${where}
         ORDER BY ${safeSortBy} ${safeSortDir}
         LIMIT $${p} OFFSET $${p+1}`,
        [...params, parseInt(limit), offset]
      )
    ]);

    const total = parseInt(countResult.rows[0].count);
    const items = emailResult.rows.map(e => ({
      id: e.id,
      subject: e.subject,
      senderName: e.sender_name,
      senderEmail: e.sender_email,
      sentAt: e.sent_at,
      path: e.path,
      hasAttachments: e.has_attachments,
      avStatus: e.av_status,
      isRestored: e.is_restored,
      isDeleted: e.is_deleted,
      spamScore: e.spam_score,
      mailboxId: e.mailbox_id,
      userEmail: e.mailbox_email,
      tags: e.spam_score >= 5 ? ['spam'] : null,
      badgeType: e.badge_type,
      badgeExpiresAt: e.badge_expires_at,
    }));

    res.json({ items, total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// GET /emails/mailboxes/list — mailboxes list for current user
router.get('/mailboxes/list', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    if (!ids.length) return res.json([]);
    const r = await db.query(
      `SELECT m.id, m.email, m.display_name, m.client_id, c.name as client_name
       FROM mailboxes m LEFT JOIN clients c ON c.id = m.client_id
       WHERE m.id = ANY($1) AND m.active = true ORDER BY m.email`,
      [ids]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /emails/folders — get folder list for a mailbox
router.get('/folders', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id } = req.query;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    if (!ids.includes(parseInt(mailbox_id))) return res.status(403).json({ error: 'Accesso negato' });

    const r = await db.query(
      `SELECT path, COUNT(*) as count FROM archived_emails
       WHERE mailbox_id=$1 GROUP BY path ORDER BY path`,
      [mailbox_id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /emails/:id — single email metadata
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    const r = await db.query(
      `SELECT ae.*, m.email as mailbox_email FROM archived_emails ae
       JOIN mailboxes m ON m.id = ae.mailbox_id
       WHERE ae.id=$1 AND ae.mailbox_id = ANY($2)`,
      [req.params.id, ids]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Email non trovata' });

    const email = r.rows[0];

    // Parse spam from headers
    let spamInfo = null;
    if (email.raw) {
      try {
        const parsed = await simpleParser(email.raw);
        spamInfo = getSpamInfo({ headers: Object.fromEntries(parsed.headers || new Map()) });
        // Update spam score in DB if missing
        if (spamInfo?.score !== null && !email.spam_score) {
          await db.query('UPDATE archived_emails SET spam_score=$1 WHERE id=$2', [spamInfo.score, email.id]);
        }
      } catch {}
    }

    res.json({
      id: email.id,
      subject: email.subject,
      senderName: email.sender_name,
      senderEmail: email.sender_email,
      recipients: email.recipients || [],
      cc: email.cc || [],
      sentAt: email.sent_at,
      path: email.path,
      hasAttachments: email.has_attachments,
      attachments: email.attachments || [],
      spamScore: email.spam_score,
      spamInfo,
      userEmail: email.mailbox_email,
      tags: email.spam_score >= 5 ? ['spam'] : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

// GET /emails/:id/content — email body
router.get('/:id/content', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    const r = await db.query(
      'SELECT body_html, body_text, raw, attachments, av_status, has_attachments FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)',
      [req.params.id, ids]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Email non trovata' });
    const { body_html, body_text, raw, attachments, av_status, has_attachments } = r.rows[0];

    // Scan on open: se av_status e' null e ha allegati, avvia scan in background
    if (av_status === null && has_attachments && raw) {
      const s = await db.query("SELECT value FROM settings WHERE key='av_scan_on_open'");
      if (s.rows[0]?.value === 'true') {
        setImmediate(async () => {
          try {
            const { scanBuffer } = require('../services/antivirus');
            const { scanBuffer: yaraScan } = require('../services/yaraScanner');
            const { decompress: dec } = require('../services/compression');
            const { simpleParser: sp } = require('mailparser');
            const rawBuf = await dec(raw);
            const parsed = await sp(rawBuf);
            let allClean = true;
            for (const att of parsed.attachments || []) {
              const r1 = await scanBuffer(att.content, att.filename);
              const r2 = await yaraScan(att.content, att.filename);
              if (!r1.clean || (!r2.skipped && !r2.clean)) { allClean = false; break; }
            }
            await db.query('UPDATE archived_emails SET av_status=$1 WHERE id=$2',
              [allClean ? 'clean' : 'infected', r.rows[0].id || req.params.id]);
          } catch(e) { console.error('[AV on open]', e.message); }
        });
      }
    }

    // Attachments con index per il download
    const atts = (attachments || []).map((a, i) => ({ ...a, index: i }));

    // Sanity check: 'false' come stringa è un artefatto del parser — trattiamo come null
    const safeHtml = (body_html && body_html !== 'false') ? body_html : null;
    const safeText = (body_text && body_text !== 'false') ? body_text : null;

    // If we have cached HTML/text use that, otherwise parse raw
    const infected = av_status === 'infected';
    if (safeHtml || safeText) {
      return res.json({ html: safeHtml, text: safeText, attachments: atts, isInfected: infected });
    }

    if (raw) {
      const rawBuffer = await decompress(raw);
      const parsed = await simpleParser(rawBuffer);
      return res.json({ html: parsed.html || null, text: parsed.text || null, attachments: atts });
    }

    res.json({ html: null, text: null, attachments: atts });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

// GET /emails/:id/attachment/:index
router.get('/:id/attachment/:index', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const ids = await getUserMailboxIds(db, req.user);
    const r = await db.query(
      'SELECT raw, attachments, av_status FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)',
      [req.params.id, ids]
    );
    if (!r.rows[0]?.raw) return res.status(404).json({ error: 'Email non trovata' });

    // Blocca allegati se email infetta — archivio immutabile ma allegati disarmati
    if (r.rows[0].av_status === 'infected') {
      return res.status(403).json({
        error: 'Download bloccato — allegato potenzialmente pericoloso rilevato da ClamAV.',
        code: 'MH-1701',
        infected: true,
      });
    }

    const rawBuffer = await decompress(r.rows[0].raw);
    const parsed = await simpleParser(rawBuffer);
    const attachments = parsed.attachments || [];
    const idx = parseInt(req.params.index);
    if (!attachments[idx]) return res.status(404).json({ error: 'Allegato non trovato' });

    const att = attachments[idx];
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename || 'attachment'}"`);
    res.send(att.content);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Errore server' }); }
});

// GET /emails/:id/scan — AV scan
router.get('/:id/scan', async (req, res) => {
  const db = req.app.locals.db;
  const { scanBuffer: scanAttachment } = require('../services/antivirus');
  try {
    const ids = await getUserMailboxIds(db, req.user);
    const r = await db.query(
      'SELECT raw, attachments FROM archived_emails WHERE id=$1 AND mailbox_id=ANY($2)',
      [req.params.id, ids]
    );
    if (!r.rows[0]?.raw) return res.status(404).json({ error: 'Email non trovata' });

    const rawBuffer = await decompress(r.rows[0].raw);
    const parsed = await simpleParser(rawBuffer);
    const results = [];
    for (const att of parsed.attachments || []) {
      const result = await scanAttachment(att.content, att.filename);
      results.push({ filename: att.filename, ...result });
    }
    const allClean = results.every(r => r.clean);
    // Salva risultato nel DB
    const avStatus = results.length === 0 ? 'clean' : (allClean ? 'clean' : 'infected');
    await db.query(
      'UPDATE archived_emails SET av_status=$1 WHERE id=$2',
      [avStatus, req.params.id]
    );
    res.json({ results, allClean, avStatus, hasAttachments: results.length > 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /emails/export — export multiple emails
router.post('/export', async (req, res) => {
  const db = req.app.locals.db;
  const { email_ids, format = 'zip' } = req.body;
  if (!email_ids?.length) return res.status(400).json({ error: 'Nessuna email selezionata' });

  try {
    const ids = await getUserMailboxIds(db, req.user);
    const r = await db.query(
      'SELECT id, subject, sent_at, path, raw, av_status FROM archived_emails WHERE id=ANY($1) AND mailbox_id=ANY($2)',
      [email_ids, ids]
    );

    // Filtra email infette dall'export
    const safeEmails = r.rows.filter(e => e.av_status !== 'infected');
    const infectedCount = r.rows.length - safeEmails.length;

    if (format === 'mbox') {
      res.setHeader('Content-Type', 'application/mbox');
      res.setHeader('Content-Disposition', 'attachment; filename="export.mbox"');
      for (const email of safeEmails) {
        const from = `From - ${new Date(email.sent_at).toUTCString()}\r\n`;
        res.write(from);
        if (email.raw) {
          const rawBuffer = await decompress(email.raw);
          res.write(rawBuffer);
        }
        res.write('\r\n\r\n');
      }
      return res.end();
    }

    // ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="export.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    for (const email of safeEmails) {
      if (email.raw) {
        const rawBuffer = await decompress(email.raw);
        const safeName = (email.subject || 'email').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        archive.append(rawBuffer, { name: `${email.path}/${safeName}_${email.id.substring(0,8)}.eml` });
      }
    }
    await archive.finalize();
  } catch (err) { console.error(err); if (!res.headersSent) res.status(500).json({ error: 'Errore export' }); }
});

// POST /emails/apply-policy/:mailbox_id — applica policy alle email già archiviate
router.post('/apply-policy/:mailbox_id', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  if (!['admin', 'superadmin'].includes(req.user.role)) return next(new AppError(ERRORS.MH_1003));
  try {
    const r = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.mailbox_id]);
    if (!r.rows[0]) return next(new AppError(ERRORS.MH_1201));
    const { applyArchivePolicy } = require('../services/scheduler');
    const count = await applyArchivePolicy(r.rows[0], db);
    res.json({ message: `Policy applicata: ${count || 0} email elaborate` });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// POST /emails/sync/:mailbox_id — manual sync trigger
router.post('/sync/:mailbox_id', async (req, res) => {
  const db = req.app.locals.db;
  if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const r = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.mailbox_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });
    const mailbox = r.rows[0];
    const { applyArchivePolicy } = require('../services/scheduler');
    let n;
    if (mailbox.oauth_provider === 'microsoft') {
      const { syncMailbox: graphSync } = require('../services/graphCrawler');
      n = await graphSync(mailbox, db);
    } else if (mailbox.oauth_provider === 'google') {
      const { syncMailbox: gmailSync } = require('../services/gmailCrawler');
      n = await gmailSync(mailbox, db);
    } else {
      const { syncMailbox } = require('../services/imapCrawler');
      n = await syncMailbox(mailbox, db);
    }
    if (applyArchivePolicy) {
      await applyArchivePolicy(mailbox, db).catch(e => console.error('[Policy]', e.message));
    }
    console.log(`Manual sync ${mailbox.email}: +${n} emails`);
    res.json({ message: 'Sincronizzazione completata', synced: n });
  } catch (err) {
    console.error('Manual sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// POST /emails/delete — marca come eliminata + badge temporizzato
router.post('/delete', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { email_ids } = req.body;
  if (!email_ids?.length) return next(new AppError(ERRORS.MH_1402));
  try {
    // Blocca email in Legal Hold
    const held = await db.query(
      `SELECT id FROM archived_emails WHERE id=ANY($1::uuid[]) AND legal_hold=true`,
      [email_ids]
    );
    if (held.rows.length > 0) {
      return res.status(403).json({
        error: `${held.rows.length} email non eliminabili: Legal Hold attivo`,
        code: 'MH-1801',
        blocked_ids: held.rows.map(r => r.id),
      });
    }
    const s = await db.query(`SELECT value FROM settings WHERE key='badge_duration_days'`);
    const days = parseInt(s.rows[0]?.value || '30');
    await db.query(
      `UPDATE archived_emails
       SET is_deleted=true, deleted_at=NOW(),
           badge_type='deleted',
           badge_expires_at=NOW() + ($1 || ' days')::interval
       WHERE id=ANY($2::uuid[])`,
      [days, email_ids]
    );
    res.json({ ok: true });
  } catch (err) { next(new AppError(ERRORS.MH_1403, err.message)); }
});

// POST /emails/undelete
router.post('/undelete', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { email_ids } = req.body;
  if (!email_ids?.length) return next(new AppError(ERRORS.MH_1402));
  try {
    await db.query(
      `UPDATE archived_emails
       SET is_deleted=false, deleted_at=NULL, is_restored=true,
           badge_type=NULL, badge_expires_at=NULL
       WHERE id=ANY($1::uuid[])`,
      [email_ids]
    );
    res.json({ ok: true });
  } catch (err) { next(new AppError(ERRORS.MH_1403, err.message)); }
});

// POST /emails/delete-imap — elimina fisicamente dall'IMAP
router.post('/delete-imap', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { email_ids, mailbox_id } = req.body;
  if (!email_ids?.length) return next(new AppError(ERRORS.MH_1402));
  try {
    const mbR = await db.query('SELECT * FROM mailboxes WHERE id=$1 AND active=true', [mailbox_id]);
    if (!mbR.rows[0]) return next(new AppError(ERRORS.MH_1201));
    const mb = mbR.rows[0];
    const { decrypt } = require('../services/crypto');
    const Imap = require('imap');

    const emailsR = await db.query(
      'SELECT id, uid, path FROM archived_emails WHERE id=ANY($1::uuid[]) AND mailbox_id=$2',
      [email_ids, mailbox_id]
    );

    const byFolder = {};
    for (const e of emailsR.rows) {
      const folder = e.path || 'INBOX';
      if (!byFolder[folder]) byFolder[folder] = [];
      if (e.uid) byFolder[folder].push(e.uid);
    }

    const imapConfig = {
      user: mb.imap_user || mb.email,
      password: decrypt(mb.imap_password_encrypted),
      host: mb.imap_host,
      port: mb.imap_port || 993,
      tls: mb.imap_tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
    };

    for (const [folder, uids] of Object.entries(byFolder)) {
      if (!uids.length) continue;
      await new Promise((resolve) => {
        const imap = new Imap(imapConfig);
        imap.once('ready', () => {
          imap.openBox(folder, false, (err) => {
            if (err) { imap.end(); return resolve(); }
            imap.setFlags(uids, ['\\Deleted'], () => {
              imap.expunge(() => { imap.end(); resolve(); });
            });
          });
        });
        imap.once('error', () => resolve());
        imap.connect();
      });
    }

    res.json({ ok: true, deleted: emailsR.rows.length });
  } catch (err) { next(new AppError(ERRORS.MH_1403, err.message)); }
});




// POST /emails/legal-hold — imposta/rimuovi Legal Hold (solo admin/superadmin)
router.post('/legal-hold', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  const { email_ids, enable, reason } = req.body;
  if (!['admin', 'superadmin'].includes(req.user.role)) return next(new AppError(ERRORS.MH_1003));
  if (!email_ids?.length) return res.status(400).json({ error: 'Nessuna email selezionata' });
  try {
    if (enable) {
      await db.query(
        `UPDATE archived_emails
         SET legal_hold=true, legal_hold_reason=$1, legal_hold_by=$2, legal_hold_at=NOW(),
             is_deleted=false, deleted_at=NULL, badge_type=NULL, badge_expires_at=NULL
         WHERE id=ANY($3::uuid[])`,
        [reason || null, req.user.id, email_ids]
      );
    } else {
      await db.query(
        `UPDATE archived_emails
         SET legal_hold=false, legal_hold_reason=NULL, legal_hold_by=NULL, legal_hold_at=NULL
         WHERE id=ANY($1::uuid[])`,
        [email_ids]
      );
    }
    res.json({ ok: true, count: email_ids.length, enabled: !!enable });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

// GET /emails/legal-hold/list — lista email in legal hold (solo admin/superadmin)
router.get('/legal-hold/list', authMiddleware, async (req, res, next) => {
  const db = req.app.locals.db;
  if (!['admin', 'superadmin'].includes(req.user.role)) return next(new AppError(ERRORS.MH_1003));
  const { page = 1, limit = 50 } = req.query;
  const offset = Math.max(0, (parseInt(page) - 1) * parseInt(limit));
  try {
    const [items, count] = await Promise.all([
      db.query(
        `SELECT ae.id, ae.subject, ae.sender_name, ae.sender_email, ae.sent_at,
                ae.path, ae.legal_hold_reason, ae.legal_hold_at,
                m.email as mailbox_email,
                u.full_name as held_by_name
         FROM archived_emails ae
         JOIN mailboxes m ON m.id = ae.mailbox_id
         LEFT JOIN users u ON u.id = ae.legal_hold_by
         WHERE ae.legal_hold = true
         ORDER BY ae.legal_hold_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), offset]
      ),
      db.query(`SELECT COUNT(*) FROM archived_emails WHERE legal_hold = true`),
    ]);
    res.json({
      items: items.rows,
      total: parseInt(count.rows[0].count),
      totalPages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit)),
      page: parseInt(page),
    });
  } catch (err) { next(new AppError(ERRORS.MH_1903, err.message)); }
});

module.exports = router;
