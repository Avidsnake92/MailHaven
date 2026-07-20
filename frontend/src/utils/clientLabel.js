// Etichetta con cui un cliente compare in elenchi e tendine.
//
// `clients.name` e' l'identita' del cliente (ragione sociale). Il vecchio campo
// `company` era un doppione: non e' piu' modificabile dal form, ma le
// installazioni esistenti possono averlo valorizzato, quindi lo si mostra solo
// quando aggiunge davvero un'informazione — mai "Acme (Acme)".
export const clientLabel = (c) => {
  if (!c) return ''
  const name = (c.name || '').trim()
  const company = (c.company || '').trim()
  return company && company !== name ? `${name} (${company})` : name
}

export default clientLabel
