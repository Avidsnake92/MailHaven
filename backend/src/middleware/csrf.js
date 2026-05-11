// CSRF Protection middleware — Double Submit Cookie pattern
// Funziona con JWT auth (stateless) — il token CSRF viene inviato nell'header X-CSRF-Token

const crypto = require('crypto');

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf_token';
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Genera token CSRF
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

// Middleware che imposta il cookie CSRF se non esiste
const csrfSetCookie = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // deve essere leggibile dal JS per inviarlo nell'header
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 ore
    });
  }
  next();
};

// Middleware che verifica il token CSRF per metodi non sicuri
const csrfProtect = (req, res, next) => {
  // Skip per metodi sicuri
  if (SAFE_METHODS.includes(req.method)) return next();
  
  // Skip per route plugin (usano token Bearer diverso)
  if (req.path.startsWith('/plugin/')) return next();
  
  // Skip per login/setup (non ancora autenticati)
  if (req.path === '/auth/login' || req.path.startsWith('/setup')) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers?.[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token non valido' });
  }

  next();
};

module.exports = { csrfSetCookie, csrfProtect, generateCsrfToken };
