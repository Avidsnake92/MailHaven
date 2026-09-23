import { useState, useEffect } from 'react'
import { useBranding } from '../context/BrandingContext'
import { Eye, EyeOff, Loader2, KeyRound, AlertCircle, Check } from 'lucide-react'
import api from '../services/api'
import { getPasswordStrength, validatePassword } from '../utils/password'

// Pagina raggiunta dal link dell'email "Password dimenticata".
// Il token resta in sessionStorage (sopravvive a un refresh della pagina) e
// viene tolto dalla barra degli indirizzi, cosi' non finisce nella cronologia.
const TOKEN_KEY = 'mh_reset_token'

const RULES = [
  { label: 'Almeno 8 caratteri', test: p => p.length >= 8 },
  { label: 'Una lettera maiuscola', test: p => /[A-Z]/.test(p) },
  { label: 'Un numero', test: p => /[0-9]/.test(p) },
  { label: 'Un carattere speciale', test: p => /[^A-Za-z0-9]/.test(p) },
]

export default function ResetPassword() {
  const { branding } = useBranding()
  const [token] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('token') || sessionStorage.getItem(TOKEN_KEY) || ''
    if (t) sessionStorage.setItem(TOKEN_KEY, t)
    return t
  })
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(!/^[a-f0-9]{64}$/.test(token))

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', '/reset-password')
  }, [])

  const strength = getPasswordStrength(pwd)
  const policyOk = pwd && validatePassword(pwd).length === 0
  const match = pwd && pwd === confirm
  const canSubmit = policyOk && match && !loading

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(''); setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: pwd })
      sessionStorage.removeItem(TOKEN_KEY)
      window.location.replace('/login?reset=ok')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'MH-1013') { sessionStorage.removeItem(TOKEN_KEY); setExpired(true) }
      else setError(data?.error || 'Impossibile aggiornare la password. Riprova.')
    } finally { setLoading(false) }
  }

  const color = branding.primary_color || '#2563eb'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.svg" alt="MailHaven" className="w-full max-w-[280px] h-auto mb-2" />
            <p className="text-sm text-gray-500 mt-1">Imposta una nuova password</p>
          </div>

          {expired ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={28} className="text-amber-500 mb-2" />
                <p className="text-sm font-semibold text-amber-800">Link non valido o scaduto</p>
                <p className="text-xs text-amber-700 mt-1">
                  Il link vale 60 minuti e si può usare una sola volta. Richiedine uno nuovo.
                </p>
              </div>
              <a href="/login?forgot=1"
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
                style={{ background: color }}>
                Richiedi un nuovo link
              </a>
              <a href="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 py-2">← Torna al login</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nuova password</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                    required autoFocus autoComplete="new-password"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 pr-10" />
                  <button type="button" onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwd && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full transition-all ${strength.color}`} style={{ width: `${(strength.score / 5) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{strength.label}</span>
                  </div>
                )}
                <ul className="mt-2 space-y-0.5">
                  {RULES.map(r => {
                    const ok = r.test(pwd)
                    return (
                      <li key={r.label} className={`text-xs flex items-center gap-1.5 ${ok ? 'text-green-600' : 'text-gray-400'}`}>
                        <Check size={12} className={ok ? 'opacity-100' : 'opacity-30'} /> {r.label}
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Conferma password</label>
                <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                  required autoComplete="new-password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2" />
                {confirm && !match && <p className="text-xs text-red-600 mt-1">Le due password non coincidono</p>}
              </div>
              <button type="submit" disabled={!canSubmit}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: color }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {loading ? 'Salvataggio...' : 'Salva la nuova password'}
              </button>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <a href="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 py-1">← Torna al login</a>
            </form>
          )}
        </div>
        <div className="text-center mt-6 space-y-0.5">
          {branding.footer_text && <p className="text-xs text-gray-400">{branding.footer_text}</p>}
          <p className="text-xs text-gray-300">by k2tech.it</p>
        </div>
      </div>
    </div>
  )
}
