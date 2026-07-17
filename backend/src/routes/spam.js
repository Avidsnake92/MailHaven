const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { simpleParser } = require('mailparser');

router.use(authMiddleware);
// Il reseller accede all'antispam solo con feat_antispam attivo (gli altri ruoli passano).
router.use(async (req, res, next) => {
  if (req.user.role !== 'reseller') return next();
  try {
    const f = (await req.app.locals.db.query('SELECT feat_antispam FROM resellers WHERE id=$1', [req.user.reseller_id])).rows[0];
    if (!f || !f.feat_antispam) return res.status(403).json({ error: 'Funzione non abilitata per questo rivenditore', code: 'MH-1003' });
    next();
  } catch (e) { res.status(500).json({ error: 'Errore server' }); }
});
router.use(require('../middleware/audit').auditMiddleware('ANTISPAM'));

// Esclusione whitelist: un'email è whitelisted se il mittente (email esatta) o il
// suo dominio è in spam_whitelist. Due varianti per le due sorgenti spam.
const WL_MH = `NOT EXISTS (SELECT 1 FROM spam_whitelist w
  WHERE (w.kind='email' AND lower(w.value)=lower(ae.sender_email))
     OR (w.kind='domain' AND lower(w.value)=lower(split_part(ae.sender_email,'@',2))))`;
const WL_ORIGIN = `NOT EXISTS (SELECT 1 FROM archived_emails aw JOIN spam_whitelist w
  ON ((w.kind='email' AND lower(w.value)=lower(aw.sender_email))
   OR (w.kind='domain' AND lower(w.value)=lower(split_part(aw.sender_email,'@',2))))
  WHERE aw.id::text = sc.email_id)`;

const getUserMailboxIds = async (db, user) => {
  if (user.role === 'superadmin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE active=true');
    return r.rows.map(r => r.id);
  }
  if (user.role === 'admin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE client_id=$1 AND active=true', [user.client_id]);
    return r.rows.map(r => r.id);
  }
  if (user.role === 'reseller') {
    const r = await db.query(`SELECT m.id FROM mailboxes m JOIN clients c ON c.id=m.client_id WHERE c.reseller_id=$1 AND m.active=true`, [user.reseller_id]);
    return r.rows.map(r => r.id);
  }
  const r = await db.query(
    `SELECT m.id FROM mailboxes m
     JOIN user_mailboxes um ON um.mailbox_id = m.id
     WHERE um.user_id=$1 AND m.active=true`,
    [user.id]
  );
  return r.rows.map(r => r.id);
};

// GET /spam — lista email spam dalla cache
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, threshold, page = 1, limit = 50, source = 'origin' } = req.query;
  const offset = (page - 1) * limit;

  try {
    let scoreThreshold = parseFloat(threshold);
    if (isNaN(scoreThreshold)) {
      const setting = await db.query("SELECT value FROM settings WHERE key='spam_score_threshold'");
      scoreThreshold = parseFloat(setting.rows[0]?.value || 5);
    }
    const allowedIds = await getUserMailboxIds(db, req.user);

    if (source === 'mh') {
      // Filtro per il punteggio INDIPENDENTE di MailHaven (Rspamd)
      const params = [scoreThreshold, allowedIds];
      let mbF = '';
      if (mailbox_id) { params.push(parseInt(mailbox_id)); mbF = ` AND ae.mailbox_id=$${params.length}`; }
      const baseWhere = `ae.mh_spam_score IS NOT NULL AND ae.mh_spam_score >= $1 AND ae.mailbox_id=ANY($2::int[])${mbF} AND ${WL_MH}`;
      const countParams = params.slice();
      params.push(parseInt(limit)); params.push(parseInt(offset));
      const result = await db.query(
        `SELECT ae.id::text AS email_id, ae.mailbox_id, ae.mh_spam_score AS score, ae.mh_spam_score, ae.mh_spam_action,
                ae.subject, ae.sender_email, ae.sent_at, ae.path
         FROM archived_emails ae WHERE ${baseWhere}
         ORDER BY ae.mh_spam_score DESC, ae.sent_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params
      );
      const count = await db.query(`SELECT COUNT(*) FROM archived_emails ae WHERE ${baseWhere}`, countParams);
      return res.json({ items: result.rows, total: parseInt(count.rows[0].count), totalPages: Math.ceil(count.rows[0].count / limit), threshold: scoreThreshold, source: 'mh' });
    }

    // source === 'origin' (default): punteggio del mail server di origine, da spam_cache
    const params = [scoreThreshold];
    let mailboxFilter = `AND sc.mailbox_id=ANY($${params.length + 1}::int[])`;
    params.push(allowedIds);
    if (mailbox_id) {
      params.push(parseInt(mailbox_id));
      mailboxFilter += ` AND sc.mailbox_id=$${params.length}`;
    }
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const result = await db.query(
      `SELECT sc.*, ae.subject, ae.sender_email, ae.sent_at, ae.path, ae.mh_spam_score, ae.mh_spam_action
       FROM spam_cache sc
       JOIN archived_emails ae ON sc.email_id=ae.id::text
       WHERE sc.score >= $1 ${mailboxFilter} AND ${WL_ORIGIN}
       ORDER BY sc.score DESC, ae.sent_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const count = await db.query(
      `SELECT COUNT(*) FROM spam_cache sc WHERE sc.score >= $1 ${mailboxFilter} AND ${WL_ORIGIN}`,
      countParams
    );

    res.json({
      items: result.rows,
      total: parseInt(count.rows[0].count),
      totalPages: Math.ceil(count.rows[0].count / limit),
      threshold: scoreThreshold,
      source: 'origin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /spam/analyze/:mailbox_id — analizza email della casella
router.post('/analyze/:mailbox_id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    // Scoping: solo caselle del chiamante
    const allowed = await getUserMailboxIds(db, req.user);
    if (!allowed.includes(Number(req.params.mailbox_id))) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    const mb = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.mailbox_id]);
    if (!mb.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });

    const mailbox = mb.rows[0];
    // Soglia configurata (non più hardcoded)
    const thrRow = await db.query("SELECT value FROM settings WHERE key='spam_score_threshold'");
    const threshold = parseFloat(thrRow.rows[0]?.value || 5);
    res.json({ message: 'Analisi avviata in background', mailbox: mailbox.email });

    setImmediate(async () => {
      try {
        let page = 1;
        let analyzed = 0;
        while (true) {
          const emails = await db.query(
            'SELECT id, spam_score, subject, sender_email, path, sent_at FROM archived_emails WHERE mailbox_id=$1 ORDER BY sent_at DESC LIMIT 50 OFFSET $2',
            [mailbox.id, (page - 1) * 50]
          );
          if (!emails.rows.length) break;

          for (const email of emails.rows) {
            try {
              if (email.spam_score !== null && email.spam_score !== undefined) {
                const isSpam = email.spam_score >= threshold;
                await db.query(
                  `INSERT INTO spam_cache (email_id, mailbox_id, score, is_spam)
                   VALUES ($1,$2,$3,$4)
                   ON CONFLICT (email_id) DO UPDATE SET score=$3, is_spam=$4, analyzed_at=NOW()`,
                  [email.id, mailbox.id, email.spam_score, isSpam]
                );
                analyzed++;
              }
            } catch (e) { /* skip */ }
          }
          page++;
          if (emails.rows.length < 50) break;
        }
        console.log(`Spam analysis complete for ${mailbox.email}: ${analyzed} emails`);
        // Secondo motore: punteggio antispam indipendente di MailHaven (Rspamd)
        try {
          const { scoreMailbox } = require('../services/spamScorer');
          const s = await scoreMailbox(db, mailbox.id);
          console.log(`Rspamd scoring ${mailbox.email}: ${s.scored} valutate, ${s.errors} errori`);
        } catch (e) { console.error('Rspamd scoring error:', e.message); }
      } catch (e) {
        console.error('Spam analysis error:', e.message);
      }
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /spam/:email_id — elimina dall'archivio
router.delete('/:email_id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const allowed = await getUserMailboxIds(db, req.user);
    const e = (await db.query('SELECT mailbox_id, legal_hold FROM archived_emails WHERE id=$1', [req.params.email_id])).rows[0];
    if (!e) return res.status(404).json({ error: 'Email non trovata' });
    if (!allowed.includes(e.mailbox_id)) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
    if (e.legal_hold) return res.status(409).json({ error: 'Email in Legal Hold: rimuovi il blocco prima di eliminarla.' });
    await db.query('DELETE FROM spam_cache WHERE email_id=$1', [req.params.email_id]);
    await db.query('DELETE FROM archived_emails WHERE id=$1', [req.params.email_id]);
    res.json({ message: 'Email eliminata' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore eliminazione' });
  }
});

// POST /spam/delete-bulk — elimina in blocco: una lista di id, oppure TUTTE le email
// spam di una casella sopra soglia (all=true). Salta quelle in Legal Hold.
router.post('/delete-bulk', async (req, res) => {
  const db = req.app.locals.db;
  const { mailbox_id, threshold, source = 'origin', ids, all } = req.body || {};
  try {
    const allowed = await getUserMailboxIds(db, req.user);
    let targetIds = [];

    if (all) {
      const mb = parseInt(mailbox_id);
      if (!mb || !allowed.includes(mb)) return res.status(403).json({ error: 'Accesso non autorizzato', code: 'MH-1003' });
      let scoreThreshold = parseFloat(threshold);
      if (isNaN(scoreThreshold)) {
        const s = await db.query("SELECT value FROM settings WHERE key='spam_score_threshold'");
        scoreThreshold = parseFloat(s.rows[0]?.value || 5);
      }
      if (source === 'mh') {
        const r = await db.query(
          `SELECT id::text AS email_id FROM archived_emails
           WHERE mh_spam_score IS NOT NULL AND mh_spam_score >= $1 AND mailbox_id=$2`,
          [scoreThreshold, mb]);
        targetIds = r.rows.map(x => x.email_id);
      } else {
        const r = await db.query(
          `SELECT email_id FROM spam_cache WHERE score >= $1 AND mailbox_id=$2`,
          [scoreThreshold, mb]);
        targetIds = r.rows.map(x => String(x.email_id));
      }
    } else if (Array.isArray(ids) && ids.length) {
      targetIds = ids.map(String);
    } else {
      return res.status(400).json({ error: 'Nessuna email selezionata' });
    }

    if (!targetIds.length) return res.json({ deleted: 0, held: 0, denied: 0 });

    // Verifica scoping + Legal Hold su tutte le email in un colpo solo
    const info = await db.query(
      `SELECT id::text AS email_id, mailbox_id, legal_hold FROM archived_emails WHERE id::text = ANY($1)`,
      [targetIds]);
    const deletable = [];
    let held = 0, denied = 0;
    for (const row of info.rows) {
      if (!allowed.includes(row.mailbox_id)) { denied++; continue; }
      if (row.legal_hold) { held++; continue; }
      deletable.push(row.email_id);
    }
    if (deletable.length) {
      await db.query('DELETE FROM spam_cache WHERE email_id = ANY($1)', [deletable]);
      await db.query('DELETE FROM archived_emails WHERE id::text = ANY($1)', [deletable]);
    }
    res.json({ deleted: deletable.length, held, denied });
  } catch (err) {
    console.error('[spam] delete-bulk:', err.message);
    res.status(500).json({ error: err.message || 'Errore eliminazione' });
  }
});

// ── Whitelist antispam ─────────────────────────────────────────────────────
const canManage = (u) => ['superadmin', 'admin', 'reseller'].includes(u.role);

// GET /spam/whitelist — elenco voci whitelist
router.get('/whitelist', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.query(
      `SELECT w.id, w.value, w.kind, w.created_at, u.full_name AS created_by_name
       FROM spam_whitelist w LEFT JOIN users u ON u.id=w.created_by
       ORDER BY w.value`);
    res.json({ items: r.rows });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// POST /spam/whitelist — aggiungi: {value,kind} diretto, oppure {email_ids,mode:'sender'|'domain'}
router.post('/whitelist', async (req, res) => {
  const db = req.app.locals.db;
  if (!canManage(req.user)) return res.status(403).json({ error: 'Non autorizzato', code: 'MH-1003' });
  const { value, kind, email_ids, mode } = req.body || {};
  try {
    let entries = []; // {value, kind}
    if (Array.isArray(email_ids) && email_ids.length) {
      const allowed = await getUserMailboxIds(db, req.user);
      const r = await db.query(
        'SELECT DISTINCT sender_email FROM archived_emails WHERE id=ANY($1::uuid[]) AND mailbox_id=ANY($2::int[]) AND sender_email IS NOT NULL',
        [email_ids, allowed]);
      const k = mode === 'domain' ? 'domain' : 'email';
      for (const row of r.rows) {
        const em = String(row.sender_email).trim().toLowerCase();
        if (!em) continue;
        entries.push({ value: k === 'domain' ? (em.split('@')[1] || em) : em, kind: k });
      }
    } else if (value) {
      const v = String(value).trim().toLowerCase();
      const k = kind === 'domain' ? 'domain' : 'email';
      if (v) entries.push({ value: v, kind: k });
    }
    if (!entries.length) return res.status(400).json({ error: 'Niente da aggiungere' });
    let added = 0;
    for (const e of entries) {
      const r = await db.query(
        `INSERT INTO spam_whitelist (value, kind, created_by) VALUES ($1,$2,$3)
         ON CONFLICT (lower(value), kind) DO NOTHING RETURNING id`,
        [e.value, e.kind, req.user.id]);
      if (r.rows.length) added++;
    }
    res.json({ ok: true, added, total: entries.length });
  } catch (err) { res.status(500).json({ error: err.message || 'Errore server' }); }
});

// DELETE /spam/whitelist/:id — rimuovi una voce
router.delete('/whitelist/:id', async (req, res) => {
  const db = req.app.locals.db;
  if (!canManage(req.user)) return res.status(403).json({ error: 'Non autorizzato', code: 'MH-1003' });
  try {
    await db.query('DELETE FROM spam_whitelist WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// GET /spam/settings
router.get('/settings', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query("SELECT key, value FROM settings WHERE key IN ('spam_score_threshold','spam_autoscore')");
    const map = {}; result.rows.forEach(r => map[r.key] = r.value);
    res.json({ threshold: parseFloat(map.spam_score_threshold || 5), autoscore: map.spam_autoscore !== 'false' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// POST /spam/settings — impostazioni globali: solo superadmin
router.post('/settings', async (req, res) => {
  const db = req.app.locals.db;
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Solo il superadmin può cambiare le impostazioni globali', code: 'MH-1003' });
  const { threshold, autoscore } = req.body;
  try {
    if (threshold !== undefined) {
      await db.query("INSERT INTO settings (key,value) VALUES ('spam_score_threshold',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [String(threshold)]);
    }
    if (autoscore !== undefined) {
      await db.query("INSERT INTO settings (key,value) VALUES ('spam_autoscore',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [autoscore ? 'true' : 'false']);
    }
    res.json({ message: 'Impostazioni aggiornate' });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

module.exports = router;
