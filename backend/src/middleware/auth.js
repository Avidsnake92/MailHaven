const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante', code: 'MH-1002' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.jti && req.app.locals.db) {
      try {
        const r = await req.app.locals.db.query(
          'SELECT 1 FROM jwt_blacklist WHERE jti=$1 AND expires_at > NOW()',
          [decoded.jti]
        );
        if (r.rows.length > 0) {
          return res.status(401).json({ error: 'Sessione non valida', code: 'MH-1002' });
        }
      } catch {}
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessione scaduta', code: 'MH-1002' });
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
