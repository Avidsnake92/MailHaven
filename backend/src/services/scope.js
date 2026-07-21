// Regola UNICA di visibilita' delle caselle per utente.
//
// Esisteva solo dentro routes/emails.js e altre parti del prodotto se l'erano
// riscritta a modo loro: la ricerca globale e le statistiche concedevano per
// appartenenza al cliente (`m.client_id = ...`), l'archivio per casella
// assegnata. Risultato: un utente non vedeva una casella nell'archivio ma ne
// leggeva il contenuto dalla ricerca. Tenerla in un posto solo e' il modo per
// non farle divergere di nuovo.
//
// superadmin -> tutte le caselle attive
// admin      -> tutte quelle del proprio cliente
// reseller   -> tutte quelle dei clienti che gestisce
// user       -> SOLO quelle esplicitamente assegnate (user_mailboxes)
const getUserMailboxIds = async (db, user) => {
  if (user.role === 'superadmin') {
    const r = await db.query('SELECT id FROM mailboxes WHERE active=true');
    return r.rows.map(x => x.id);
  }
  if (user.role === 'admin') {
    const r = await db.query(
      'SELECT id FROM mailboxes WHERE client_id=$1 AND active=true',
      [user.client_id]
    );
    return r.rows.map(x => x.id);
  }
  if (user.role === 'reseller') {
    const r = await db.query(
      `SELECT m.id FROM mailboxes m JOIN clients c ON c.id = m.client_id
       WHERE c.reseller_id = $1 AND m.active = true`,
      [user.reseller_id]
    );
    return r.rows.map(x => x.id);
  }
  const r = await db.query(
    `SELECT m.id FROM mailboxes m
     JOIN user_mailboxes um ON um.mailbox_id = m.id
     WHERE um.user_id = $1 AND m.active = true`,
    [user.id]
  );
  return r.rows.map(x => x.id);
};

module.exports = { getUserMailboxIds };
