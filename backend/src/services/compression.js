const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Comprimi un buffer
const compress = async (buffer) => {
  return await gzip(buffer);
};

// Decomprimi un buffer — gestisce cifrato+compresso, solo compresso, o raw
const decompress = async (buffer) => {
  if (!buffer) return null;
  let buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  
  // Se cifrato (inizia con lunghezza IV = 16 come UInt32BE)
  try {
    const ivLen = buf.readUInt32BE(0);
    if (ivLen === 16 && buf.length > 20) {
      const { decryptBuffer } = require('./crypto');
      buf = decryptBuffer(buf);
    }
  } catch (e) { /* non cifrato, continua */ }
  
  // Controlla il magic number gzip (1f 8b)
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return await gunzip(buf);
  }
  // Non compresso — ritorna as-is (retrocompatibilità email vecchie)
  return buf;
};

module.exports = { compress, decompress };
