require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ── Trust proxy — solo un livello (nginx) ──────────────────────────────────
// Evita IP spoofing da header X-Forwarded-For non fidati
app.set('trust proxy', 1);

// ── Helmet hardened ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // React dev build
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: [
        "'self'",
        'https://*.office.com',
        'https://*.officeapps.live.com',
        'https://outlook.office.com',
      ],
      frameAncestors: [
        "'self'",
        'https://*.office.com',
        'https://*.officeapps.live.com',
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
}));

// ── CORS — whitelist invece di wildcard ────────────────────────────────────
const getAllowedOrigins = () => {
  const origins = ['http://localhost:8080', 'http://localhost:3000'];
  if (process.env.APP_URL) origins.push(process.env.APP_URL);
  if (process.env.ADDITIONAL_ORIGINS) {
    origins.push(...process.env.ADDITIONAL_ORIGINS.split(',').map(o => o.trim()));
  }
  return origins;
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) return callback(null, true);
    // Reti locali — sempre permesse (installazioni self-hosted)
    if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Plugin Office
    if (origin.endsWith('.office.com') || origin.endsWith('.officeapps.live.com')) {
      return callback(null, true);
    }
    console.warn(`[CORS] Origine bloccata: ${origin}`);
    return callback(new Error(`CORS: origine non permessa: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400,
}));

// ── Rate limiting ──────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste, riprova tra poco', code: 'MH-1903' },
  skip: (req) => req.path === '/health',
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime?.getTime() || Date.now() + 15 * 60 * 1000;
    const minutesLeft = Math.ceil((resetMs - Date.now()) / 60000);
    res.status(429).json({
      error: `Troppi tentativi di accesso. Riprova tra ${minutesLeft} minut${minutesLeft === 1 ? 'o' : 'i'}.`,
      blocked: true,
      retryAfterMinutes: minutesLeft,
    });
  },
});
app.use('/api/auth/login', authLimiter);

const PORT = process.env.PORT || 3001;

// ── Database con pool tuning ───────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                    // max connessioni nel pool
  idleTimeoutMillis: 30000,   // chiudi connessioni idle dopo 30s
  connectionTimeoutMillis: 5000, // timeout connessione 5s
  statement_timeout: 30000,   // timeout query 30s
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

app.locals.db = pool;

// ── Migration automatica ───────────────────────────────────────────────────
const migrate = require('./db/migrate');
pool.connect()
  .then(client => { client.release(); return migrate(pool); })
  .catch(e => console.error('[Migration] Errore:', e.message));

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Input sanitization middleware ──────────────────────────────────────────
// Rimuove chiavi con $ e . per prevenire NoSQL injection patterns
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  next();
});

// ── Plugin Office — headers speciali ──────────────────────────────────────
app.use('/plugin', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy',
    "frame-ancestors 'self' https://*.office.com https://*.officeapps.live.com https://outlook.office.com");
  next();
});

const pluginPath = require('path').resolve(__dirname, '../plugins');
app.use('/plugin', require('express').static(pluginPath));

// ── Routes ─────────────────────────────────────────────────────────────────
// NOTA: ogni route montata UNA sola volta (fix route duplicate)
app.use('/api/setup',    require('./routes/setup'));
app.use('/api/plugin',   require('./routes/plugin'));
app.use('/api/oauth',    require('./routes/oauth'));
app.use('/api/update',   require('./routes/update'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/emails',   require('./routes/emails'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/branding', require('./routes/branding'));
app.use('/api/restore',  require('./routes/restore'));
app.use('/api/backup',   require('./routes/backup'));
app.use('/api/spam',     require('./routes/spam'));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Gestione errori centralizzata ──────────────────────────────────────────
const { errorHandler } = require('./errors');
app.use(errorHandler);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato', code: 'MH-1903' });
});

// ── Avvio server ───────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`MailHaven backend running on port ${PORT}`);

  // Inizializza JWT blacklist
  try {
    const { initBlacklist, startCleanup } = require('./services/jwtBlacklist');
    await initBlacklist(pool);
    startCleanup(pool);
  } catch (e) { console.error('JWT Blacklist init error:', e.message); }

  try {
    const scheduler = require('./services/scheduler');
    await scheduler.start(pool);
    console.log('IMAP scheduler started');
  } catch (e) { console.error('Scheduler error:', e.message); }

  try {
    const avScheduler = require('./services/avScheduler');
    await avScheduler.start(pool);
  } catch (e) { console.error('AV Scheduler error:', e.message); }

  try {
    const avBatchScanner = require('./services/avBatchScanner');
    avBatchScanner.start(pool, 10);
    app.locals.avBatchScanner = avBatchScanner;
    console.log('AV Batch Scanner started');
  } catch (e) { console.error('AV Batch Scanner error:', e.message); }
});
