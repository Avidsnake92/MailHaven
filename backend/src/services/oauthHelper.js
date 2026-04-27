const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

const SCOPES = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'offline_access',
  'User.Read'
].join(' ');

const refreshMicrosoftToken = async (db, mailbox) => {
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
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
  await db.query(
    'UPDATE mailboxes SET oauth_access_token=$1, oauth_expires_at=$2 WHERE id=$3',
    [tokens.access_token, expiresAt, mailbox.id]
  );
  return tokens.access_token;
};

const getValidToken = async (db, mailbox) => {
  if (mailbox.oauth_expires_at && new Date(mailbox.oauth_expires_at) > new Date(Date.now() + 60000)) {
    return mailbox.oauth_access_token;
  }
  return await refreshMicrosoftToken(db, mailbox);
};

module.exports = { getValidToken, refreshMicrosoftToken };
