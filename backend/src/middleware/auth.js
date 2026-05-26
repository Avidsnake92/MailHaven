const jwt = require('jsonwebtoken');
const { isBlacklisted } = require('../services/jwtBlacklist');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante', code: 'MH-1002' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Controlla blacklist (logout)
    if (decoded.jti) {
      const db = req.app.locals.db;
      const blocked = await isBlacklisted(db, decoded.jti);
      if (blocked) return res.status(401).json({ error: 'Token non valido o scaduto', code: 'MH-1002' });
    }

    req.user = decoded;

    // Aggiorna last_seen della sessione (ogni 5 minuti per non sovraccaricare il DB)
    if (decoded.jti && req.app.locals.db) {
      const db = req.app.locals.db;
      db.query(
        `UPDATE user_sessions SET last_seen=NOW(), expires_at=NOW() + INTERVAL '15 minutes'
         WHERE jti=$1 AND expires_at > NOW()`,
        [decoded.jti]
      ).catch(() => {});
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessione scaduta, effettua nuovamente il login', code: 'MH-1002' });
    }
    return res.status(401).json({ error: 'Token non valido', code: 'MH-1002' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.flat().includes(req.user?.role)) {
    return res.status(403).json({ error: 'Permessi insufficienti', code: 'MH-1004' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
