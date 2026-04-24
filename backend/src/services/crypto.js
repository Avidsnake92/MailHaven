const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// La chiave viene letta dinamicamente ad ogni chiamata
// così funziona anche se ENCRYPTION_KEY viene caricata dal DB dopo l'avvio
const getKey = () => {
  const keyHex = process.env.ENCRYPTION_KEY || '0'.repeat(64);
  return Buffer.from(keyHex, 'hex');
};

const encrypt = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decrypt = (encrypted) => {
  if (!encrypted) return null;
  try {
    const [ivHex, authTagHex, encryptedData] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decrypt error:', err.message);
    return null;
  }
};

module.exports = { encrypt, decrypt };
