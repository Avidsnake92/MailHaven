const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const getBaseUrl = () => process.env.OAUTH_REDIRECT_BASE_URL || process.env.APP_URL || '';
const REDIRECT_URI = () => { const b = getBaseUrl(); return b ? `${b}/api/oauth/microsoft/callback` : null; };

const SCOPES = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'offline_access',
  'openid',
  'email',
  'profile',
].join(' ');

// ── Step 1: redirect verso Microsoft login ────────────────────────────────
router.get('/microsoft', async (req, res) => {
  const { client_id, token } = req.query;
  const db = req.app.locals.db;

  // Verifica JWT passato come query param
  let userId = null;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (e) {
      return res.status(401).send('Token non valido');
    }
  } else {
    return res.status(401).send('Token mancante - effettua il login prima');
  }

  const state = Buffer.from(JSON.stringify({
    user_id: userId,
    client_id: client_id || null,
    ts: Date.now()
  })).toString('base64');

  const url = new URL(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  const redirectUri = REDIRECT_URI();
  if (!redirectUri) return res.status(400).send('APP_URL non configurato. Impostalo nelle Impostazioni.');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  res.redirect(url.toString());
});

// ── Step 2: callback da Microsoft ────────────────────────────────────────
router.get('/microsoft/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const db = req.app.locals.db;

  if (error) {
    return res.redirect(`/admin?oauth_error=${encodeURIComponent(error_description || error)}&tab=mailboxes`);
  }

  try {
    // Decodifica state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { user_id, client_id } = stateData;

    // Scambia code con token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI(),
        grant_type: 'authorization_code',
      })
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Leggiamo email e nome dall'id_token (JWT) incluso nella risposta — non serve Graph
    let email = null;
    let displayName = null;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
        console.log('[OAuth MS] id_token claims:', JSON.stringify({ email: payload.email, upn: payload.preferred_username, name: payload.name }));
        email = payload.email || payload.preferred_username;
        displayName = payload.name || null;
        if (email && email.includes('#EXT#')) {
          const localPart = email.split('#EXT#')[0];
          const atIdx = localPart.lastIndexOf('_');
          if (atIdx !== -1) email = localPart.substring(0, atIdx) + '@' + localPart.substring(atIdx + 1);
        }
      } catch(e) { console.log('[OAuth MS] id_token parse error:', e.message); }
    }
    if (!email) throw new Error('Email non trovata nell\'account Microsoft — assicurati che lo scope openid+email sia abilitato');

    // Calcola scadenza token
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 giorni

    // Salva o aggiorna la casella nel DB
    const existing = await db.query(
      'SELECT id FROM mailboxes WHERE email=$1', [email]
    );

    if (existing.rows[0]) {
      // Aggiorna token esistente
      await db.query(
        `UPDATE mailboxes SET
          oauth_provider='microsoft',
          oauth_access_token=$1,
          oauth_refresh_token=$2,
          oauth_expires_at=$3,
          oauth_refresh_expires_at=$4,
          imap_host='outlook.office365.com',
          imap_port=993,
          imap_tls=true,
          imap_user=$5,
          active=true,
          updated_at=NOW()
        WHERE email=$6`,
        [tokens.access_token, tokens.refresh_token, expiresAt, refreshExpiresAt, email, email]
      );
    } else {
      // Crea nuova casella
      await db.query(
        `INSERT INTO mailboxes
          (email, display_name, client_id, imap_host, imap_port, imap_tls, imap_user,
           oauth_provider, oauth_access_token, oauth_refresh_token, oauth_expires_at,
           oauth_refresh_expires_at, active)
         VALUES ($1,$2,$3,'outlook.office365.com',993,true,$4,'microsoft',$5,$6,$7,$8,true)`,
        [
          email,
          displayName || email,
          client_id,
          email,
          tokens.access_token,
          tokens.refresh_token,
          expiresAt,
          refreshExpiresAt
        ]
      );
    }

    res.redirect(`/admin?oauth_success=${encodeURIComponent(email)}&tab=mailboxes`);
  } catch (err) {
    console.error('OAuth Microsoft error:', err.message);
    res.redirect(`/admin?oauth_error=${encodeURIComponent(err.message)}&tab=mailboxes`);
  }
});

// ── Refresh token Microsoft ───────────────────────────────────────────────
const refreshMicrosoftToken = async (db, mailbox) => {
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: mailbox.oauth_refresh_token,
        grant_type: 'refresh_token',
        scope: SCOPES,
      })
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description);

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    await db.query(
      'UPDATE mailboxes SET oauth_access_token=$1, oauth_expires_at=$2 WHERE id=$3',
      [tokens.access_token, expiresAt, mailbox.id]
    );
    return tokens.access_token;
  } catch (err) {
    console.error('Token refresh error:', err.message);
    throw err;
  }
};

// ── Ottieni token valido per IMAP ─────────────────────────────────────────
const getValidToken = async (db, mailbox) => {
  if (new Date(mailbox.oauth_expires_at) > new Date(Date.now() + 60000)) {
    return mailbox.oauth_access_token;
  }
  return await refreshMicrosoftToken(db, mailbox);
};


// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH2
// ═══════════════════════════════════════════════════════════════════════════
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = () => { const b = getBaseUrl(); return b ? `${b}/api/oauth/google/callback` : null; };

const GOOGLE_SCOPES = [
  'https://mail.google.com/',           // IMAP/SMTP full access
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// ── Step 1: redirect verso Google login ──────────────────────────────────
router.get('/google', async (req, res) => {
  const { client_id, token } = req.query;
  const db = req.app.locals.db;

  let userId = null;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (e) {
      return res.status(401).send('Token non valido');
    }
  } else {
    return res.status(401).send('Token mancante - effettua il login prima');
  }

  const state = Buffer.from(JSON.stringify({
    user_id: userId,
    client_id: client_id || null,
    ts: Date.now()
  })).toString('base64');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  const googleRedirectUri = GOOGLE_REDIRECT_URI();
  if (!googleRedirectUri) return res.status(400).send('APP_URL non configurato. Impostalo nelle Impostazioni.');
  url.searchParams.set('redirect_uri', googleRedirectUri);
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');   // ottieni refresh_token
  url.searchParams.set('prompt', 'consent');         // forza consent per avere sempre refresh_token

  res.redirect(url.toString());
});

// ── Step 2: callback da Google ────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const db = req.app.locals.db;

  if (error) {
    return res.redirect(`/admin?oauth_error=${encodeURIComponent(error_description || error)}&tab=mailboxes`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { user_id, client_id } = stateData;

    // Scambia code con token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: GOOGLE_REDIRECT_URI(),
        grant_type: 'authorization_code',
      })
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Ottieni info utente
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const gUser = await userRes.json();

    const email = gUser.email;
    if (!email) throw new Error('Email non trovata nell\'account Google');

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    const refreshExpiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 giorni

    // Determina host IMAP
    const isWorkspace = !email.endsWith('@gmail.com');
    const imapHost = 'imap.gmail.com'; // uguale per Gmail e Workspace

    const existing = await db.query('SELECT id FROM mailboxes WHERE email=$1', [email]);

    if (existing.rows[0]) {
      await db.query(
        `UPDATE mailboxes SET
          oauth_provider='google',
          oauth_access_token=$1,
          oauth_refresh_token=COALESCE($2, oauth_refresh_token),
          oauth_expires_at=$3,
          oauth_refresh_expires_at=$4,
          imap_host='imap.gmail.com',
          imap_port=993,
          imap_tls=true,
          imap_user=$5,
          active=true,
          updated_at=NOW()
        WHERE email=$6`,
        [
          tokens.access_token,
          tokens.refresh_token || null,  // Google non sempre rimanda il refresh_token
          expiresAt,
          refreshExpiresAt,
          email,
          email
        ]
      );
    } else {
      if (!tokens.refresh_token) {
        throw new Error('Refresh token non ricevuto da Google. Revoca l\'accesso da account.google.com/permissions e riprova.');
      }
      await db.query(
        `INSERT INTO mailboxes
          (email, display_name, client_id, imap_host, imap_port, imap_tls, imap_user,
           oauth_provider, oauth_access_token, oauth_refresh_token, oauth_expires_at,
           oauth_refresh_expires_at, active)
         VALUES ($1,$2,$3,'imap.gmail.com',993,true,$4,'google',$5,$6,$7,$8,true)`,
        [
          email,
          gUser.name || email,
          client_id,
          email,
          tokens.access_token,
          tokens.refresh_token,
          expiresAt,
          refreshExpiresAt
        ]
      );
    }

    res.redirect(`/admin?oauth_success=${encodeURIComponent(email)}&tab=mailboxes`);
  } catch (err) {
    console.error('OAuth Google error:', err.message);
    res.redirect(`/admin?oauth_error=${encodeURIComponent(err.message)}&tab=mailboxes`);
  }
});

// ── Refresh token Google ──────────────────────────────────────────────────
const refreshGoogleToken = async (db, mailbox) => {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: mailbox.oauth_refresh_token,
        grant_type: 'refresh_token',
      })
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    await db.query(
      'UPDATE mailboxes SET oauth_access_token=$1, oauth_expires_at=$2 WHERE id=$3',
      [tokens.access_token, expiresAt, mailbox.id]
    );
    return tokens.access_token;
  } catch (err) {
    console.error('Google token refresh error:', err.message);
    throw err;
  }
};

// ── Ottieni token valido Google per IMAP ──────────────────────────────────
const getValidGoogleToken = async (db, mailbox) => {
  if (new Date(mailbox.oauth_expires_at) > new Date(Date.now() + 60000)) {
    return mailbox.oauth_access_token;
  }
  return await refreshGoogleToken(db, mailbox);
};

module.exports = router;
module.exports.getValidToken = getValidToken;
module.exports.getValidGoogleToken = getValidGoogleToken;
