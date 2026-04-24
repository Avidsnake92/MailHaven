const NodeClam = require('clamscan');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const os = require('os');

let clamav = null;

const getClamAV = async () => {
  if (clamav) return clamav;
  try {
    const clam = await new NodeClam().init({
      remove_infected: false,
      quarantine_infected: false,
      scan_log: null,
      debug_mode: false,
      scan_recursively: false,
      clamscan: { path: '/usr/bin/clamscan', active: true },
      clamdscan: { socket: '/run/clamav/clamd.sock', active: true, timeout: 60000 },
      preference: 'clamdscan',
    });
    clamav = clam;
    return clamav;
  } catch (err) {
    console.error('ClamAV init error:', err.message);
    return null;
  }
};

// Scan a buffer writing to a temp file
const scanBuffer = async (buffer, filename = 'file') => {
  const tmpPath = path.join(os.tmpdir(), `av_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    const clam = await getClamAV();
    if (!clam) return { clean: true, skipped: true, reason: 'ClamAV non disponibile' };

    fs.writeFileSync(tmpPath, buffer);
    const { isInfected, viruses } = await clam.scanFile(tmpPath);
    return {
      clean: !isInfected,
      infected: isInfected,
      viruses: viruses || [],
      filename,
    };
  } catch (err) {
    console.error('AV scan error:', err.message);
    return { clean: true, skipped: true, reason: err.message };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
};

// Scan all attachments in a raw EML
const scanEmailAttachments = async (rawBuffer) => {
  try {
    const parsed = await simpleParser(rawBuffer);
    const results = [];
    for (const att of parsed.attachments || []) {
      const result = await scanBuffer(att.content, att.filename);
      results.push({ ...result, filename: att.filename, size: att.size, contentType: att.contentType });
    }
    return {
      hasAttachments: results.length > 0,
      allClean: results.every(r => r.clean),
      results,
    };
  } catch (err) {
    return { hasAttachments: false, allClean: true, results: [], error: err.message };
  }
};

const getSpamInfo = (email) => {
  if (!email) return null;
  const headers = email.headers || {};
  const spamStatus = headers['x-spam-status'] || headers['X-Spam-Status'] || '';
  const spamScore = headers['x-spam-score'] || headers['X-Spam-Score'] || '';
  const spamFlag = headers['x-spam-flag'] || headers['X-Spam-Flag'] || '';
  if (!spamStatus && !spamScore && !spamFlag) return null;
  const score = parseFloat(spamScore) || parseFloat(spamStatus.match(/score=([\d.]+)/)?.[1]) || null;
  const isSpam = spamFlag.toLowerCase() === 'yes' || spamStatus.toLowerCase().startsWith('yes');
  return { isSpam, score, status: spamStatus || null };
};

module.exports = { scanBuffer, scanEmailAttachments, getSpamInfo };
