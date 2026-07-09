import { useState, useEffect } from 'react'
import { useBranding } from '../context/BrandingContext'
import { Eye, EyeOff, Loader2, ShieldCheck, Lock } from 'lucide-react'
import api from '../services/api'

// Icone SVG inline per M365 e Google
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
  </svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2fa, setRequires2fa] = useState(false)
  const [locked, setLocked] = useState(false)
  const [retryMinutes, setRetryMinutes] = useState(null)
  const [ssoAvailable, setSsoAvailable] = useState({ microsoft: false, google: false })
  const [sso2faPartial, setSso2faPartial] = useState(null)
  const { branding } = useBranding()

  const backendBase = window.location.origin.replace(':8080', ':3001')

  // Leggi token/errore SSO dai query params al ritorno dal redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoToken = params.get('sso_token')
    const ssoError = params.get('sso_error')
    const sso2fa   = params.get('sso_2fa')

    if (ssoToken) {
      // Login SSO riuscito → recupera profilo e accedi
      api.get('/auth/me', { headers: { Authorization: 'Bearer ' + ssoToken } })
        .then(res => {
          doLogin(ssoToken, res.data)
        })
        .catch(() => setError('Errore durante il login SSO'))
      window.history.replaceState({}, '', '/login')
    } else if (ssoError) {
      setError(decodeURIComponent(ssoError))
      window.history.replaceState({}, '', '/login')
    } else if (sso2fa) {
      setSso2faPartial(decodeURIComponent(sso2fa))
      setRequires2fa(true)
      window.history.replaceState({}, '', '/login')
    }

    // Controlla quali SSO sono configurati
    fetch('/api/oauth/app-config/public').then(r => r.json()).then(res => {
      setSsoAvailable({
        microsoft: res.data?.microsoft?.configured || false,
        google: res.data?.google?.configured || false,
      })
    }).catch(() => {})
  }, [])

  const doLogin = (token, user) => {
    localStorage.setItem('mv_token', token)
    localStorage.setItem('mv_user', JSON.stringify(user))
    window.location.replace('/')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setWarning('')
    setLoading(true)
    try {
      let body
      if (sso2faPartial && requires2fa) {
        // SSO + 2FA: verifica il codice TOTP con il partial token
        const res = await api.post('/auth/2fa/verify-sso', { partial_token: sso2faPartial, totp_code: totpCode })
        if (res.data.token) { doLogin(res.data.token, res.data.user); return; }
      } else {
        body = requires2fa
          ? { email, password, totp_code: totpCode }
          : { email, password }
        const res = await api.post('/auth/login', body)
        const remaining = parseInt(res.headers?.['x-ratelimit-remaining'] ?? '99')
        if (remaining === 1) setWarning('Attenzione: questo è l\'ultimo tentativo disponibile. Dopo verrai bloccato per 15 minuti.')
        if (res.data.token) { doLogin(res.data.token, res.data.user); return; }
        if (res.data.requires_2fa) { setRequires2fa(true); setError(''); }
      }
    } catch (err) {
      const data = err.response?.data
      const remaining = parseInt(err.response?.headers?.['x-ratelimit-remaining'] ?? '99')
      if (data?.blocked) { setLocked(true); setRetryMinutes(data.retryAfterMinutes || 15); setError(data.error) }
      else if (data?.locked) { setLocked(true); setError(data.error) }
      else if (data?.requires_2fa) { setRequires2fa(true); setError(data.error || 'Codice 2FA non valido') }
      else { setError(data?.error || 'Email o password non corretti'); if (remaining === 1) setWarning('Attenzione: questo è l\'ultimo tentativo disponibile.') }
    } finally { setLoading(false) }
  }

  const hasSso = ssoAvailable.microsoft || ssoAvailable.google

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.svg" alt="MailHaven" className="w-full max-w-[280px] h-auto mb-2" />
            <p className="text-sm text-gray-500 mt-1">
              {requires2fa ? 'Verifica identità' : 'Accedi al tuo archivio email'}
            </p>
          </div>

          {/* Account bloccato */}
          {locked && (
            <div className="mb-6 flex flex-col items-center text-center p-4 bg-red-50 border border-red-200 rounded-xl">
              <Lock size={28} className="text-red-500 mb-2" />
              <p className="text-sm font-semibold text-red-700">Accesso temporaneamente bloccato</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
              {retryMinutes && (
                <p className="text-xs text-red-500 mt-2">Riprova tra circa <strong>{retryMinutes} minut{retryMinutes === 1 ? 'o' : 'i'}</strong>.</p>
              )}
            </div>
          )}

          {/* Step 2FA */}
          {requires2fa && !locked && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <ShieldCheck size={32} className="text-blue-500 mb-2" />
                <p className="text-sm text-gray-600 text-center">
                  {sso2faPartial
                    ? 'Il tuo account ha la verifica in 2 passaggi attiva. Inserisci il codice dall\'app di autenticazione.'
                    : 'Apri la tua app di autenticazione e inserisci il codice a 6 cifre'}
                </p>
              </div>
              <input
                type="text" value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required autoFocus placeholder="000000" maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2"
              />
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading || totpCode.length !== 6}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {loading ? 'Verifica...' : 'Verifica codice'}
              </button>
              <button type="button" onClick={() => { setRequires2fa(false); setTotpCode(''); setError(''); setSso2faPartial(null) }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
                ← Torna al login
              </button>
            </form>
          )}

          {/* Form login normale */}
          {!requires2fa && !locked && (
            <div className="space-y-4">
              {/* Bottoni SSO — visibili solo se configurati */}
              {hasSso && (
                <div className="space-y-2">
                  {ssoAvailable.microsoft && (
                    <a href={`${backendBase}/api/auth/oauth/microsoft`}
                      className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                      <MicrosoftIcon />
                      Accedi con Microsoft 365
                    </a>
                  )}
                  {ssoAvailable.google && (
                    <a href={`${backendBase}/api/auth/oauth/google`}
                      className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                      <GoogleIcon />
                      Accedi con Google
                    </a>
                  )}
                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">oppure</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </div>
              )}

              {/* Form email/password */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="nome@azienda.it"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} required placeholder="Password"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 pr-10" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {warning && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
                    <span>{warning}</span>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                  style={{ background: branding.primary_color || '#2563eb' }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Accesso in corso...' : 'Accedi'}
                </button>
              </form>
            </div>
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
