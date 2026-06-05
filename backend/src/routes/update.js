const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

const requireSuperadmin = [authMiddleware, requireRole('superadmin')];
const APP_DIR = '/app';
const VERSION_FILE = path.join(APP_DIR, 'version.json');
const GIT_STATUS_FILE = path.join(APP_DIR, 'data', 'git-status.json');

// GET /update/status
router.get('/status', requireSuperadmin, async (req, res) => {
  try {
    // Versione corrente
    let currentVersion = { version: '1.0.0', build: '—' };
    try { currentVersion = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); } catch {}

    // Leggi git-status.json (aggiornato dallo scheduler ogni 30min o da check-update.sh sull'host)
    let gitStatus = { currentCommit: 'unknown', remoteCommit: 'unknown', commitsBehind: 0, latestCommits: [] };
    try { gitStatus = JSON.parse(fs.readFileSync(GIT_STATUS_FILE, 'utf8')); } catch {}

    // Changelog dal file locale
    let changelog = '';
    try {
      const changelogPath = path.join(APP_DIR, 'CHANGELOG.md');
      if (fs.existsSync(changelogPath)) changelog = fs.readFileSync(changelogPath, 'utf8');
    } catch {}

    const hasUpdate = gitStatus.currentCommit !== gitStatus.remoteCommit &&
                      gitStatus.remoteCommit !== 'unknown';

    // Versione target (dal tag piu recente)
    const targetVersion = gitStatus.latestTag ? gitStatus.latestTag.replace(/^v/, '') : null;

    res.json({
      current: currentVersion,
      currentCommit: gitStatus.currentCommit,
      remoteCommit: gitStatus.remoteCommit,
      hasUpdate,
      commitsBehind: gitStatus.commitsBehind,
      targetVersion,
      latestTag: gitStatus.latestTag,
      latestCommits: gitStatus.latestCommits || [],
      changelog,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /update/run
router.post('/run', requireSuperadmin, async (req, res) => {
  res.json({ started: true, message: 'Aggiornamento avviato. Il server si riavvierà a breve.' });
  // Crea file trigger — il cron sull'host lo rileva e lancia do-update.sh
  setTimeout(() => {
    const fs = require('fs');
    try {
      fs.writeFileSync('/app/data/update.trigger', new Date().toISOString());
      console.log('[Update] Trigger file creato');
    } catch(e) {
      console.error('[Update] Errore creazione trigger:', e.message);
    }
  }, 1000);
});

module.exports = router;
