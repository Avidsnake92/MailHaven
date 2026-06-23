const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { simpleParser } = require('mailparser');

router.use(authMiddleware);

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
  const { mailbox_id, threshold, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let scoreThreshold = parseFloat(threshold);
    if (isNaN(scoreThreshold)) {
      const setting = await db.query("SELECT value FROM settings WHERE key='spam_score_threshold'");
      scoreThreshold = parseFloat(setting.rows[0]?.value || 5);
    }

    const allowedIds = await getUserMailboxIds(db, req.user);
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
      `SELECT sc.*, ae.subject, ae.sender_email, ae.sent_at, ae.path
       FROM spam_cache sc
       JOIN archived_emails ae ON sc.email_id=ae.id::text
       WHERE sc.score >= $1 ${mailboxFilter}
       ORDER BY sc.score DESC, ae.sent_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const count = await db.query(
      `SELECT COUNT(*) FROM spam_cache sc WHERE sc.score >= $1 ${mailboxFilter}`,
      countParams
    );

    res.json({
      items: result.rows,
      total: parseInt(count.rows[0].count),
      totalPages: Math.ceil(count.rows[0].count / limit),
      threshold: scoreThreshold
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
    const mb = await db.query('SELECT * FROM mailboxes WHERE id=$1', [req.params.mailbox_id]);
    if (!mb.rows[0]) return res.status(404).json({ error: 'Casella non trovata' });

    const mailbox = mb.rows[0];
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
                const isSpam = email.spam_score >= 5;
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
    await db.query('DELETE FROM spam_cache WHERE email_id=$1', [req.params.email_id]);
    await db.query('DELETE FROM archived_emails WHERE id=$1', [req.params.email_id]);
    res.json({ message: 'Email eliminata' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore eliminazione' });
  }
});

// GET /spam/settings
router.get('/settings', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query("SELECT value FROM settings WHERE key='spam_score_threshold'");
    res.json({ threshold: parseFloat(result.rows[0]?.value || 5) });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

// POST /spam/settings
router.post('/settings', async (req, res) => {
  const db = req.app.locals.db;
  const { threshold } = req.body;
  try {
    await db.query(
      "INSERT INTO settings (key,value) VALUES ('spam_score_threshold',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [String(threshold)]
    );
    res.json({ message: 'Soglia aggiornata', threshold });
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

module.exports = router;
