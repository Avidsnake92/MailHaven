import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, RefreshCw } from 'lucide-react'

// ─── Avvisi (toast) ───────────────────────────────────────────────────────────
// notify('Testo', 'error' | 'success' | 'info')  — richiamabile da qualunque punto.
// reportError(err, 'Eliminazione cliente')       — mostra il motivo reale dell'errore.
const TOAST_EVENT = 'mh:toast'
const CONFIRM_EVENT = 'mh:confirm'

export function notify(message, type = 'info') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }))
}

export function reportError(err, context) {
  // 401 = sessione scaduta: lo gestisce già l'interceptor con il redirect al login
  if (err?.response?.status === 401) return
  const reason = err?.displayMessage || err?.response?.data?.error || err?.message || 'errore sconosciuto'
  notify(context ? `${context}: ${reason}` : reason, 'error')
}

export function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    let n = 0
    const onToast = (e) => {
      const id = ++n
      const { message, type } = e.detail
      setItems(list => [...list.slice(-3), { id, message, type }])
      setTimeout(() => setItems(list => list.filter(t => t.id !== id)), type === 'error' ? 9000 : 4500)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  const style = {
    error: { box: 'bg-red-50 border-red-200 text-red-800', Icon: AlertTriangle, ic: 'text-red-500' },
    success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: CheckCircle2, ic: 'text-emerald-500' },
    info: { box: 'bg-white border-gray-200 text-gray-800', Icon: Info, ic: 'text-blue-500' },
  }
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none"
      role="status" aria-live="polite">
      {items.map(t => {
        const s = style[t.type] || style.info
        return (
          <div key={t.id} role={t.type === 'error' ? 'alert' : undefined}
            className={`pointer-events-auto flex items-start gap-2.5 border rounded-lg shadow-lg px-3.5 py-3 text-sm ${s.box}`}>
            <s.Icon size={17} className={`shrink-0 mt-0.5 ${s.ic}`} />
            <span className="flex-1 break-words">{t.message}</span>
            <button onClick={() => setItems(list => list.filter(x => x.id !== t.id))}
              aria-label="Chiudi avviso" className="shrink-0 opacity-60 hover:opacity-100"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Conferma ─────────────────────────────────────────────────────────────────
// if (!(await confirmDialog({ title, message, confirmLabel, danger: true }))) return
export function confirmDialog(opts) {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: { ...opts, resolve } }))
  })
}

export function ConfirmHost() {
  const [req, setReq] = useState(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    const onConfirm = (e) => {
      openerRef.current = document.activeElement
      setReq(e.detail)
    }
    window.addEventListener(CONFIRM_EVENT, onConfirm)
    return () => window.removeEventListener(CONFIRM_EVENT, onConfirm)
  }, [])

  const close = (value) => {
    if (!req) return
    req.resolve(value)
    setReq(null)
    try { openerRef.current?.focus?.() } catch {}
  }

  useEffect(() => {
    if (!req) return
    // Per le azioni distruttive il focus parte su "Annulla": un Invio distratto non cancella nulla
    ;(req.danger ? cancelRef : confirmRef).current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Tab') {
        const els = [cancelRef.current, confirmRef.current].filter(Boolean)
        const i = els.indexOf(document.activeElement)
        e.preventDefault()
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  const { title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger } = req
  return (
    <div className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="mh-confirm-title" aria-describedby="mh-confirm-msg"
        className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-50' : 'bg-blue-50'}`}>
            <AlertTriangle size={20} className={danger ? 'text-red-600' : 'text-blue-600'} />
          </div>
          <div className="min-w-0">
            <h2 id="mh-confirm-title" className="text-base font-bold text-gray-900">{title}</h2>
            <p id="mh-confirm-msg" className="text-sm text-gray-600 mt-1.5 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button ref={cancelRef} onClick={() => close(false)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {cancelLabel}
          </button>
          <button ref={confirmRef} onClick={() => close(true)}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1 ${danger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dialog accessibile ──────────────────────────────────────────────────────
// Guscio per i modali: role="dialog", Esc per chiudere, Tab che resta dentro,
// focus iniziale sul primo controllo e ritorno del focus a chi l'ha aperto.
// <Dialog label="Nuova casella" onClose={...} className="fixed inset-0 ...">…</Dialog>
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Dialog({ label, onClose, className = '', children, ...rest }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const node = ref.current
    const opener = document.activeElement
    const items = () => [...node.querySelectorAll(FOCUSABLE)].filter(e => e.offsetParent !== null)
    if (!node.contains(document.activeElement)) {
      const first = node.querySelector('[data-autofocus]') || items()[0]
      ;(first || node).focus()
    }
    const onKey = (e) => {
      // Una conferma aperta sopra ha la precedenza
      if (document.querySelector('[role=alertdialog]')) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current && closeRef.current(); return }
      if (e.key !== 'Tab') return
      const f = items()
      if (!f.length) { e.preventDefault(); return }
      const first = f[0], last = f[f.length - 1]
      if (!node.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      try { opener && opener.focus && opener.focus() } catch {}
    }
  }, [])

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      className={`${className} focus:outline-none`} {...rest}>
      {children}
    </div>
  )
}

// ─── Errore di caricamento con "Riprova" ─────────────────────────────────────
// {loadError && <LoadError message={loadError} onRetry={load} />}
export function LoadError({ message, onRetry, className = '' }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm ${className}`}>
      <AlertTriangle size={17} className="shrink-0 text-red-500" />
      <span className="flex-1 min-w-[12rem] break-words">{message || 'Impossibile caricare i dati.'}</span>
      {onRetry && (
        <button onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-100 font-medium">
          <RefreshCw size={14} /> Riprova
        </button>
      )}
    </div>
  )
}
