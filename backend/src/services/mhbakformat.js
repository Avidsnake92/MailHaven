/**
 * Formato .mhbak — MailHaven Backup Format
 * 
 * Struttura file:
 * [4 byte] Magic: "MHBK"
 * [2 byte] Version: 0x0001
 * [4 byte] IV length (16)
 * [16 byte] IV AES-256-CBC
 * [4 byte] Salt length (32)
 * [32 byte] Salt per key derivation
 * [8 byte] Timestamp (Unix ms, BigInt)
 * [4 byte] Lunghezza metadata JSON cifrato
 * [N byte] Metadata JSON cifrato
 * [resto] Contenuto ZIP cifrato
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const MAGIC = Buffer.from('MHBK');
const VERSION = Buffer.alloc(2);
VERSION.writeUInt16BE(1, 0);

// Deriva chiave da ENCRYPTION_KEY + salt
const deriveKey = (encryptionKey, salt) => {
  return crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');
};

// Cifra buffer con AES-256-CBC
const encryptBuffer = (buffer, key, iv) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
};

// Decifra buffer
const decryptBuffer = (buffer, key, iv) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
};

// Crea header .mhbak
const createHeader = (encryptionKey, metadata) => {
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(32);
  const key = deriveKey(encryptionKey, salt);
  
  // Cifra metadata
  const metaJson = Buffer.from(JSON.stringify(metadata), 'utf8');
  const encryptedMeta = encryptBuffer(metaJson, key, iv);
  
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigInt64BE(BigInt(Date.now()), 0);
  
  const ivLenBuf = Buffer.alloc(4);
  ivLenBuf.writeUInt32BE(iv.length, 0);
  
  const saltLenBuf = Buffer.alloc(4);
  saltLenBuf.writeUInt32BE(salt.length, 0);
  
  const metaLenBuf = Buffer.alloc(4);
  metaLenBuf.writeUInt32BE(encryptedMeta.length, 0);
  
  return {
    header: Buffer.concat([MAGIC, VERSION, ivLenBuf, iv, saltLenBuf, salt, timestamp, metaLenBuf, encryptedMeta]),
    key,
    iv
  };
};

// Leggi header .mhbak
const readHeader = (buffer, encryptionKey) => {
  let offset = 0;
  
  // Magic
  const magic = buffer.slice(offset, offset + 4);
  if (!magic.equals(MAGIC)) throw new Error('File non valido — magic number errato');
  offset += 4;
  
  // Version
  const version = buffer.readUInt16BE(offset);
  if (version !== 1) throw new Error(`Versione non supportata: ${version}`);
  offset += 2;
  
  // IV
  const ivLen = buffer.readUInt32BE(offset); offset += 4;
  const iv = buffer.slice(offset, offset + ivLen); offset += ivLen;
  
  // Salt
  const saltLen = buffer.readUInt32BE(offset); offset += 4;
  const salt = buffer.slice(offset, offset + saltLen); offset += saltLen;
  
  // Timestamp
  const timestamp = buffer.readBigInt64BE(offset); offset += 8;
  
  // Deriva chiave
  const key = deriveKey(encryptionKey, salt);
  
  // Metadata
  const metaLen = buffer.readUInt32BE(offset); offset += 4;
  const encryptedMeta = buffer.slice(offset, offset + metaLen); offset += metaLen;
  const metaJson = decryptBuffer(encryptedMeta, key, iv);
  const metadata = JSON.parse(metaJson.toString('utf8'));
  
  return { metadata, key, iv, timestamp: new Date(Number(timestamp)), headerEnd: offset };
};

module.exports = { createHeader, readHeader, encryptBuffer, decryptBuffer, deriveKey };
