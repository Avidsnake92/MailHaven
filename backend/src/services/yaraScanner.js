const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RULES_FILE = path.join(__dirname, '../../yara-rules/mailhaven.yar');
let yaraAvailable = null;

const checkYara = () => new Promise((resolve) => {
  if (yaraAvailable !== null) { resolve(yaraAvailable); return; }
  exec('yara --version', (err) => {
    yaraAvailable = !err;
    if (!yaraAvailable) console.log('[YARA] Non disponibile nel container');
    else console.log('[YARA] Disponibile');
    resolve(yaraAvailable);
  });
});

const scanBuffer = async (buffer, filename) => {
  const available = await checkYara();
  if (!available) return { clean: true, skipped: true, reason: 'YARA non disponibile' };
  if (!fs.existsSync(RULES_FILE)) return { clean: true, skipped: true, reason: 'Regole non trovate' };

  const tmpPath = path.join(os.tmpdir(), 'yara_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await new Promise((resolve) => {
      exec('yara -r ' + RULES_FILE + ' ' + tmpPath, { timeout: 30000 }, (err, stdout, stderr) => {
        const matches = (stdout || '').trim().split('\n').filter(l => l.trim());
        if (matches.length > 0) {
          const rules = matches.map(m => m.split(' ')[0].trim());
          resolve({ clean: false, infected: true, viruses: rules, filename, source: 'YARA' });
        } else {
          resolve({ clean: true, infected: false, viruses: [], filename, source: 'YARA' });
        }
      });
    });
  } catch(e) {
    return { clean: true, skipped: true, reason: e.message };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
};

module.exports = { scanBuffer };
