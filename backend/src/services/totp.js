const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');

const generateSecret = () => {
  const secret = new Secret();
  return secret.base32;
};

const generateQR = async (email, secretBase32, appName = 'MailHaven') => {
  const totp = new TOTP({
    issuer: appName,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { uri, qrDataUrl };
};

const verifyToken = (secretBase32, token) => {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

module.exports = { generateSecret, generateQR, verifyToken };
