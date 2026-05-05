const router = require('express').Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { authMiddleware, requireRole } = require('../middleware/auth');

const requireSuperadmin = [authMiddleware, requireRole('superadmin')];
const APP_DIR = '/app';
const VERSION_FILE = path.join(APP_DIR, 'version.json');
const GIT_STATUS_FILE = path.join(APP_DIR, 'git-status.json');

// GET /update/status
router.get('/status', requireSuperadmin, async (req, res) => {
  try {
    // Versione corrente
    let currentVersion = { version: '1.0.0', build: '—' };
    try { currentVersion = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); } catch {}

    // Aggiorna git status tramite script sul host
    await new Promise((resolve) => {
      exec('bash /root/mailhaven/check-update.sh', (err) => resolve());
    });

    // Leggi risultato
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

    res.json({
      current: currentVersion,
      currentCommit: gitStatus.currentCommit,
      remoteCommit: gitStatus.remoteCommit,
      hasUpdate,
      commitsBehind: gitStatus.commitsBehind,
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
  setTimeout(() => {
    exec('bash /root/mailhaven/do-update.sh', (err) => {
      if (err) console.error('[Update] Errore:', err.message);
    });
  }, 1000);
});

module.exports = router;
