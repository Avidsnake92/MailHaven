/**
 * MailHaven — Input Validation
 * Schema validation leggero senza dipendenze esterne
 * Uso: validate(schema)(req, res, next)
 */

const { AppError, ERRORS } = require('../errors');

// ── Tipi di validazione ────────────────────────────────────────────────────
const v = {
  string: (opts = {}) => (val, key) => {
    if (val === undefined || val === null) {
      if (opts.required !== false) return `${key} è obbligatorio`;
      return null;
    }
    if (typeof val !== 'string') return `${key} deve essere una stringa`;
    const trimmed = val.trim();
    if (opts.min && trimmed.length < opts.min) return `${key} deve avere almeno ${opts.min} caratteri`;
    if (opts.max && trimmed.length > opts.max) return `${key} deve avere al massimo ${opts.max} caratteri`;
    if (opts.pattern && !opts.pattern.test(trimmed)) return `${key} non è in formato valido`;
    return null;
  },

  email: (opts = {}) => (val, key) => {
    if (!val) return opts.required !== false ? `${key} è obbligatorio` : null;
    if (typeof val !== 'string') return `${key} deve essere una stringa`;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(val.trim())) return `${key} non è un indirizzo email valido`;
    return null;
  },

  password: (opts = {}) => (val, key) => {
    if (!val) return `${key} è obbligatorio`;
    if (typeof val !== 'string') return `${key} deve essere una stringa`;
    if (val.length < (opts.min || 8)) return `${key} deve avere almeno ${opts.min || 8} caratteri`;
    if (val.length > (opts.max || 128)) return `${key} è troppo lungo`;
    return null;
  },

  number: (opts = {}) => (val, key) => {
    if (val === undefined || val === null) {
      if (opts.required !== false) return `${key} è obbligatorio`;
      return null;
    }
    const n = Number(val);
    if (isNaN(n)) return `${key} deve essere un numero`;
    if (opts.min !== undefined && n < opts.min) return `${key} deve essere almeno ${opts.min}`;
    if (opts.max !== undefined && n > opts.max) return `${key} deve essere al massimo ${opts.max}`;
    return null;
  },

  boolean: (opts = {}) => (val, key) => {
    if (val === undefined && opts.required === false) return null;
    if (typeof val !== 'boolean' && val !== 'true' && val !== 'false' && val !== 0 && val !== 1) {
      return `${key} deve essere un booleano`;
    }
    return null;
  },

  enum: (values, opts = {}) => (val, key) => {
    if (val === undefined || val === null) {
      if (opts.required !== false) return `${key} è obbligatorio`;
      return null;
    }
    if (!values.includes(val)) return `${key} deve essere uno di: ${values.join(', ')}`;
    return null;
  },

  uuid: (opts = {}) => (val, key) => {
    if (!val) return opts.required !== false ? `${key} è obbligatorio` : null;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(val)) return `${key} deve essere un UUID valido`;
    return null;
  },

  array: (opts = {}) => (val, key) => {
    if (!val) return opts.required !== false ? `${key} è obbligatorio` : null;
    if (!Array.isArray(val)) return `${key} deve essere un array`;
    if (opts.min && val.length < opts.min) return `${key} deve avere almeno ${opts.min} elementi`;
    if (opts.max && val.length > opts.max) return `${key} deve avere al massimo ${opts.max} elementi`;
    return null;
  },
};

// ── Middleware factory ─────────────────────────────────────────────────────
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'body' ? req.body
      : source === 'query' ? req.query
      : req.params;

    const errors = [];
    for (const [key, validator] of Object.entries(schema)) {
      const error = validator(data[key], key);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      return next(new AppError(
        { ...ERRORS.MH_1402, message: errors.join('; ') },
        errors.join('; ')
      ));
    }
    next();
  };
};

// ── Schema predefiniti ─────────────────────────────────────────────────────
const schemas = {
  login: {
    email: v.email(),
    password: v.password(),
  },
  changePassword: {
    current_password: v.password({ min: 1 }),
    new_password: v.password({ min: 8, max: 128 }),
  },
  createUser: {
    email: v.email(),
    password: v.password({ min: 8 }),
    full_name: v.string({ min: 2, max: 100 }),
    role: v.enum(['superadmin', 'admin', 'user']),
  },
  createMailbox: {
    email: v.email(),
    imap_host: v.string({ min: 3, max: 255 }),
  },
  emailIds: {
    email_ids: v.array({ min: 1 }),
  },
  report: {
    type: v.enum(['bug', 'feature', 'support', 'other']),
    description: v.string({ min: 10, max: 5000 }),
  },
};

module.exports = { validate, v, schemas };
