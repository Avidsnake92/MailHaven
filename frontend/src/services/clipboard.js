// Copia testo negli appunti, con fallback per i contesti NON sicuri.
// navigator.clipboard esiste solo su HTTPS o localhost: le installazioni su
// http://IP:8080 non lo hanno, quindi si ripiega su un textarea + execCommand.
export async function copyText(text) {
  const value = text == null ? '' : String(text)
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch { /* ricade sul metodo legacy */ }
  try {
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '-1000px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
