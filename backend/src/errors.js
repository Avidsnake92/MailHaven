/**
 * MailHaven — Codici errore centralizzati
 * Formato: MH-[CATEGORIA][CODICE]
 *
 * 10xx — Autenticazione / Autorizzazione
 * 11xx — Utenti
 * 12xx — Caselle email
 * 13xx — Sincronizzazione IMAP
 * 14xx — Email / Archivio
 * 15xx — Ripristino
 * 16xx — Policy archiviazione
 * 17xx — Antivirus
 * 18xx — Backup
 * 19xx — Sistema / Setup
 */

const ERRORS = {
  // ── Autenticazione ──────────────────────────────────────────
  MH_1001: { code: 'MH-1001', message: 'Credenziali non valide',               httpStatus: 401 },
  MH_1002: { code: 'MH-1002', message: 'Token non valido o scaduto',           httpStatus: 401 },
  MH_1003: { code: 'MH-1003', message: 'Accesso non autorizzato',              httpStatus: 403 },
  MH_1004: { code: 'MH-1004', message: 'Ruolo insufficiente',                  httpStatus: 403 },
  MH_1005: { code: 'MH-1005', message: 'Account disabilitato',                 httpStatus: 403 },

  // ── Utenti ──────────────────────────────────────────────────
  MH_1101: { code: 'MH-1101', message: 'Utente non trovato',                   httpStatus: 404 },
  MH_1102: { code: 'MH-1102', message: 'Email già in uso',                     httpStatus: 409 },
  MH_1103: { code: 'MH-1103', message: 'Password troppo corta (min 8 caratteri)', httpStatus: 400 },
  MH_1104: { code: 'MH-1104', message: 'Dati utente non validi',               httpStatus: 400 },

  // ── Caselle email ────────────────────────────────────────────
  MH_1201: { code: 'MH-1201', message: 'Casella non trovata',                  httpStatus: 404 },
  MH_1202: { code: 'MH-1202', message: 'Casella già esistente',                httpStatus: 409 },
  MH_1203: { code: 'MH-1203', message: 'Eliminazione casella fallita',         httpStatus: 500 },
  MH_1204: { code: 'MH-1204', message: 'Credenziali IMAP non configurate',     httpStatus: 400 },
  MH_1205: { code: 'MH-1205', message: 'Dati casella non validi',              httpStatus: 400 },

  // ── Sincronizzazione IMAP ────────────────────────────────────
  MH_1301: { code: 'MH-1301', message: 'Connessione IMAP fallita',             httpStatus: 502 },
  MH_1302: { code: 'MH-1302', message: 'Autenticazione IMAP fallita',          httpStatus: 502 },
  MH_1303: { code: 'MH-1303', message: 'Timeout connessione IMAP',             httpStatus: 504 },
  MH_1304: { code: 'MH-1304', message: 'Sincronizzazione già in corso',        httpStatus: 409 },
  MH_1305: { code: 'MH-1305', message: 'Cartella IMAP non trovata',            httpStatus: 404 },

  // ── Email / Archivio ─────────────────────────────────────────
  MH_1401: { code: 'MH-1401', message: 'Email non trovata',                    httpStatus: 404 },
  MH_1402: { code: 'MH-1402', message: 'Nessuna email selezionata',            httpStatus: 400 },
  MH_1403: { code: 'MH-1403', message: 'Eliminazione email fallita',           httpStatus: 500 },
  MH_1404: { code: 'MH-1404', message: 'Contenuto email non disponibile',      httpStatus: 404 },
  MH_1405: { code: 'MH-1405', message: 'Export fallito',                       httpStatus: 500 },
  MH_1406: { code: 'MH-1406', message: 'Parametri ricerca non validi',         httpStatus: 400 },

  // ── Ripristino ───────────────────────────────────────────────
  MH_1501: { code: 'MH-1501', message: 'Ripristino fallito — email non trovata', httpStatus: 404 },
  MH_1502: { code: 'MH-1502', message: 'Ripristino fallito — IMAP non raggiungibile', httpStatus: 502 },
  MH_1503: { code: 'MH-1503', message: 'Ripristino fallito — casella destinazione non valida', httpStatus: 400 },
  MH_1504: { code: 'MH-1504', message: 'Ripristino parziale — alcune email non ripristinate', httpStatus: 207 },

  // ── Policy archiviazione ─────────────────────────────────────
  MH_1601: { code: 'MH-1601', message: 'Policy non configurata',               httpStatus: 400 },
  MH_1602: { code: 'MH-1602', message: 'Parametri policy non validi',          httpStatus: 400 },

  // ── Antivirus ────────────────────────────────────────────────
  MH_1701: { code: 'MH-1701', message: 'Scansione antivirus fallita',          httpStatus: 500 },
  MH_1702: { code: 'MH-1702', message: 'ClamAV non disponibile',               httpStatus: 503 },
  MH_1703: { code: 'MH-1703', message: 'Virus rilevato negli allegati',        httpStatus: 422 },

  // ── Backup ───────────────────────────────────────────────────
  MH_1801: { code: 'MH-1801', message: 'Backup fallito',                       httpStatus: 500 },
  MH_1802: { code: 'MH-1802', message: 'Configurazione backup non valida',     httpStatus: 400 },
  MH_1803: { code: 'MH-1803', message: 'Ripristino backup fallito',            httpStatus: 500 },

  // ── Sistema / Setup ──────────────────────────────────────────
  MH_1901: { code: 'MH-1901', message: 'Setup non completato',                 httpStatus: 503 },
  MH_1902: { code: 'MH-1902', message: 'Errore database',                      httpStatus: 500 },
  MH_1903: { code: 'MH-1903', message: 'Errore interno del server',            httpStatus: 500 },
  MH_1904: { code: 'MH-1904', message: 'Configurazione SMTP non valida',       httpStatus: 400 },
};

/**
 * Classe errore applicativo MailHaven
 * Uso: throw new AppError(ERRORS.MH_1201)
 *   oppure con dettaglio: throw new AppError(ERRORS.MH_1201, 'mailbox_id: 42')
 */
class AppError extends Error {
  constructor(errorDef, detail = null) {
    super(errorDef.message);
    this.mhCode    = errorDef.code;
    this.mhMessage = errorDef.message;
    this.httpStatus = errorDef.httpStatus || 500;
    this.detail    = detail;
  }
}

/**
 * Middleware Express — gestione errori globale
 * Va registrato DOPO tutte le route in index.js:
 *   app.use(errorHandler)
 */
const errorHandler = (err, req, res, next) => {
  // Errore AppError (nostro)
  if (err instanceof AppError) {
    console.error(`[${err.mhCode}] ${err.mhMessage}${err.detail ? ' — ' + err.detail : ''}`);
    return res.status(err.httpStatus).json({
      error:   err.mhMessage,
      code:    err.mhCode,
      detail:  err.detail || undefined,
    });
  }

  // Errore Postgres FK violation
  if (err.code === '23503') {
    console.error('[MH-1902] FK violation:', err.detail);
    return res.status(500).json({
      error:  ERRORS.MH_1203.message,
      code:   ERRORS.MH_1203.code,
      detail: err.detail || undefined,
    });
  }

  // Errore generico
  console.error('[MH-1903]', err.message);
  return res.status(500).json({
    error:  ERRORS.MH_1903.message,
    code:   'MH-1903',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

module.exports = { ERRORS, AppError, errorHandler };
