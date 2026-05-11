require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Gestiamo CSP manualmente
  crossOriginEmbedderPolicy: false,
}));

// Trust proxy (nginx reverse proxy)
app.set('trust proxy', 1);

// Rate limiting globale
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 200,
  message: { error: 'Troppe richieste, riprova tra poco' },
  skip: (req) => req.path.startsWith('/plugin/') || req.path === '/health',
});
app.use('/api/', limiter);

// Rate limiting specifico per auth (più restrittivo)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Troppi tentativi di accesso, riprova tra 15 minuti' },
});
app.use('/api/auth/login', authLimiter);
const PORT = process.env.PORT || 3001;

// Database
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Make pool available globally
app.locals.db = pool;

// Esegui migration automatica all'avvio
const migrate = require('./db/migrate');
pool.connect().then(client => {
  client.release();
  return migrate(pool);
}).catch(e => console.error('[Migration] Errore:', e.message));

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/setup', require('./routes/setup'));
app.use('/api/plugin', require('./routes/plugin'));
app.use('/api/oauth', require('./routes/oauth'));
app.use('/api/update', require('./routes/update'));

// Headers per Office Add-in
app.use('/plugin', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.office.com https://*.officeapps.live.com https://outlook.office.com");
  next();
});

// Serve plugin files statically
const pluginPath = require('path').resolve(__dirname, '../plugins');
app.use('/plugin', require('express').static(pluginPath));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/emails', require('./routes/emails'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/branding', require('./routes/branding'));
app.use('/api/restore', require('./routes/restore'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/spam', require('./routes/spam'));
app.use('/api/oauth', require('./routes/oauth'));
app.use('/api/update', require('./routes/update'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`MailHaven backend running on port ${PORT}`);

  // Carica le chiavi dal DB se non presenti nelle env vars
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('encryption_key', 'jwt_secret')"
    );
    for (const row of result.rows) {
      if (row.key === 'encryption_key' && row.value) {
        process.env.ENCRYPTION_KEY = row.value;
        console.log('ENCRYPTION_KEY caricata dal database');
      }
      if (row.key === 'jwt_secret' && row.value) {
        process.env.JWT_SECRET = row.value;
        console.log('JWT_SECRET caricato dal database');
      }
    }
  } catch (e) {
    console.error('Errore caricamento chiavi dal DB:', e.message);
  }

  // Start IMAP scheduler
  try {
    const scheduler = require('./services/scheduler');
    await scheduler.start(pool);
    console.log('IMAP scheduler started');
  } catch (e) {
    console.error('Scheduler error:', e.message);
  }

  // Start AV scheduler
  try {
    const avScheduler = require('./services/avScheduler');
    await avScheduler.start(pool);
  } catch (e) {
    console.error('AV Scheduler error:', e.message);
  }

  // Start AV Batch Scanner (scansiona nuove email con allegati in background)
  try {
    const avBatchScanner = require('./services/avBatchScanner');
    avBatchScanner.start(pool, 10); // ogni 10 minuti
    // Rendi disponibile globalmente per il trigger post-sync
    app.locals.avBatchScanner = avBatchScanner;
    console.log('AV Batch Scanner started');
  } catch (e) {
    console.error('AV Batch Scanner error:', e.message);
  }
});
