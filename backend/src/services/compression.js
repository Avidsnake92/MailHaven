const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Comprimi un buffer
const compress = async (buffer) => {
  return await gzip(buffer);
};

// Decomprimi un buffer — gestisce sia compressi che non compressi (retrocompatibilità)
const decompress = async (buffer) => {
  if (!buffer) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  
  // Controlla il magic number gzip (1f 8b)
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return await gunzip(buf);
  }
  // Non compresso — ritorna as-is (retrocompatibilità email vecchie)
  return buf;
};

module.exports = { compress, decompress };
