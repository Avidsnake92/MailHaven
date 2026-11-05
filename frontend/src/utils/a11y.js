// Rete di sicurezza per l'accessibilità: dà un nome ai controlli che ne sono privi.
// Il codice delle pagine ha circa 100 campi e molti bottoni-icona; invece di
// toccarli uno a uno, qui li si completa a runtime, in modo idempotente:
//  - <label> senza `for` → collegata al campo che la segue
//  - campi senza etichetta → aria-label da placeholder / title / name
//  - bottoni e link con sola icona → aria-label dal title o dal tipo di icona
//  - <th> → scope="col"; <img> senza alt → alt="" (decorativa)
// Dove la pagina fornisce già un nome (aria-label, label for, testo) non tocca nulla.

const FIELD = 'input:not([type=hidden]),select,textarea'

const ICON_NAMES = {
  'x': 'Chiudi', 'trash': 'Elimina', 'trash-2': 'Elimina',
  'refresh-cw': 'Aggiorna', 'refresh-ccw': 'Aggiorna', 'rotate-cw': 'Aggiorna',
  'rotate-ccw': 'Ripristina', 'pencil': 'Modifica', 'edit': 'Modifica', 'edit-2': 'Modifica', 'edit-3': 'Modifica',
  'copy': 'Copia', 'download': 'Scarica', 'upload': 'Carica', 'eye': 'Mostra password', 'eye-off': 'Nascondi password',
  'plus': 'Aggiungi', 'settings': 'Impostazioni', 'play': 'Riprendi', 'pause': 'Pausa',
  'log-out': 'Esci', 'more-vertical': 'Altre azioni', 'more-horizontal': 'Altre azioni',
  'chevron-left': 'Precedente', 'chevron-right': 'Successivo', 'chevron-up': 'Su', 'chevron-down': 'Giù',
  'search': 'Cerca', 'key-round': 'Chiave', 'external-link': 'Apri', 'info': 'Informazioni',
  'menu': 'Menu', 'save': 'Salva', 'check': 'Conferma', 'link': 'Collegamento', 'mail': 'Email',
  'shield': 'Protezione', 'shield-check': 'Protezione', 'paperclip': 'Allegato',
}

let counter = 0

const hasName = (el) =>
  el.getAttribute('aria-label') ||
  el.getAttribute('aria-labelledby') ||
  (el.textContent || '').trim() ||
  el.getAttribute('title') ||
  el.querySelector('img[alt]:not([alt=""])')

function iconName(el) {
  const svg = el.querySelector('svg')
  if (!svg) return ''
  const cls = [...svg.classList].find(c => c.startsWith('lucide-') && c !== 'lucide')
  return cls ? (ICON_NAMES[cls.slice(7)] || '') : ''
}

function labelledByLabel(c) {
  if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')) return true
  if (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) return true
  return !!c.closest('label')
}

export function fixAccessibility(root = document) {
  // 1) <label> senza `for`: collega al primo campo che segue (fratello o dentro un fratello)
  root.querySelectorAll('label:not([for])').forEach(label => {
    if (label.querySelector(FIELD)) return
    let sib = label.nextElementSibling
    while (sib && sib.tagName !== 'LABEL') {
      const c = sib.matches(FIELD) ? sib : sib.querySelector(FIELD)
      if (c) {
        if (!c.id) c.id = `mh-f-${++counter}`
        if (!document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) label.htmlFor = c.id
        return
      }
      sib = sib.nextElementSibling
    }
  })

  // 2) campi ancora senza nome: usa placeholder, title o name
  root.querySelectorAll(FIELD).forEach(c => {
    if (labelledByLabel(c)) return
    let name = c.getAttribute('placeholder') || c.getAttribute('title') || c.getAttribute('name')
    if (!name) {
      // Etichetta breve scritta come testo subito prima del campo ("Dal" … [data])
      const prev = c.previousElementSibling
      const t = prev && !prev.matches(FIELD) && prev.children.length === 0 ? (prev.textContent || '').trim() : ''
      if (t && t.length <= 40) name = t
    }
    if (name) c.setAttribute('aria-label', name)
  })

  // 3) bottoni e link con sola icona
  root.querySelectorAll('button,a[href],[role=button]').forEach(el => {
    if (hasName(el)) return
    const n = iconName(el)
    if (n) el.setAttribute('aria-label', n)
  })

  // 4) intestazioni di tabella e immagini decorative
  root.querySelectorAll('th:not([scope])').forEach(th => th.setAttribute('scope', 'col'))
  root.querySelectorAll('img:not([alt])').forEach(img => img.setAttribute('alt', ''))
}

export function startAutoAccessibility() {
  if (typeof document === 'undefined' || !window.MutationObserver) return
  let scheduled = false
  const run = () => { scheduled = false; try { fixAccessibility() } catch {} }
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(run) }
  }).observe(document.body, { childList: true, subtree: true })
  run()
}
