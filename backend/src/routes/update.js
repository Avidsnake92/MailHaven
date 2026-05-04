const router = require('express').Router();
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const requireSuperadmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Accesso negato' });
  next();
};

const APP_DIR = path.resolve(__dirname, '../../..');
const VERSION_FILE = path.join(APP_DIR, 'version.json');
const GITHUB_REPO = 'Avidsnake92/MailHaven';

// GET /update/status — versione corrente e verifica aggiornamenti
router.get('/status', requireSuperadmin, async (req, res) => {
  try {
    // Versione corrente
    const currentVersion = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));

    // Fetch ultimo release da GitHub
    const https = require('https');
    const githubData = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'MailHaven-Updater' }
      };
      https.get(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      }).on('error', reject);
    });

    // Fetch CHANGELOG dal repo
    const changelogData = await new Promise((resolve) => {
      const options = {
        hostname: 'raw.githubusercontent.com',
        path: `/${GITHUB_REPO}/main/CHANGELOG.md`,
        headers: { 'User-Agent': 'MailHaven-Updater' }
      };
      https.get(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => resolve(data));
      }).on('error', () => resolve(''));
    });

    // Commit corrente
    let currentCommit = 'unknown';
    try { currentCommit = execSync('git rev-parse --short HEAD', { cwd: APP_DIR }).toString().trim(); } catch {}

    // Commit remoto
    let remoteCommit = 'unknown';
    try {
      execSync('git fetch origin main --quiet', { cwd: APP_DIR });
      remoteCommit = execSync('git rev-parse --short origin/main', { cwd: APP_DIR }).toString().trim();
    } catch {}

    const hasUpdate = currentCommit !== remoteCommit;

    // Conta commits in ritardo
    let commitsBehind = 0;
    try {
      const behind = execSync(`git rev-list HEAD..origin/main --count`, { cwd: APP_DIR }).toString().trim();
      commitsBehind = parseInt(behind) || 0;
    } catch {}

    res.json({
      current: currentVersion,
      currentCommit,
      remoteCommit,
      hasUpdate,
      commitsBehind,
      latestRelease: githubData?.tag_name || null,
      releaseUrl: githubData?.html_url || null,
      changelog: changelogData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /update/run — esegui aggiornamento
router.post('/run', requireSuperadmin, async (req, res) => {
  // Risposta immediata, aggiornamento in background
  res.json({ started: true, message: 'Aggiornamento avviato. Il server si riavvierà a breve.' });

  setTimeout(async () => {
    try {
      console.log('[Update] Avvio aggiornamento...');
      execSync('git pull origin main', { cwd: APP_DIR, stdio: 'inherit' });
      console.log('[Update] git pull completato');

      // Rebuild frontend
      execSync('bash /root/mailvault/build-frontend.sh', { cwd: APP_DIR, stdio: 'inherit' });
      console.log('[Update] Frontend rebuild completato');

      // Aggiorna versione
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
        const newVersion = { version: pkg.version || '1.0.0', build: new Date().toISOString().split('T')[0] };
        fs.writeFileSync(VERSION_FILE, JSON.stringify(newVersion));
      } catch {}

      console.log('[Update] Riavvio backend...');
      // Riavvia il processo node (PM2 o docker restart)
      exec('docker compose restart mailvault-backend', { cwd: APP_DIR });
    } catch (err) {
      console.error('[Update] Errore:', err.message);
    }
  }, 1000);
});

// GET /update/logs — ultimi commit
router.get('/logs', requireSuperadmin, (req, res) => {
  try {
    const log = execSync('git log --oneline -10 origin/main', { cwd: APP_DIR }).toString().trim();
    const commits = log.split('\n').map(line => {
      const [hash, ...msg] = line.split(' ');
      return { hash, message: msg.join(' ') };
    });
    res.json(commits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
