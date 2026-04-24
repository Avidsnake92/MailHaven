import { useState } from 'react'
import { useBranding } from '../context/BrandingContext'
import { Archive, Eye, EyeOff, Loader2, ShieldCheck, Lock } from 'lucide-react'
import api from '../services/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2fa, setRequires2fa] = useState(false)
  const [locked, setLocked] = useState(false)
  const { branding } = useBranding()

  const doLogin = (token, user) => {
    localStorage.setItem('mv_token', token)
    localStorage.setItem('mv_user', JSON.stringify(user))
    window.location.replace('/')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = requires2fa
        ? { email, password, totp_code: totpCode }
        : { email, password }

      const res = await api.post('/auth/login', body)

      if (res.data.token) {
        doLogin(res.data.token, res.data.user)
      } else if (res.data.requires_2fa) {
        setRequires2fa(true)
        setError('')
      }
    } catch (err) {
      const data = err.response?.data
      if (data?.locked) {
        setLocked(true)
        setError(data.error)
      } else if (data?.requires_2fa) {
        setRequires2fa(true)
        setError(data.error || 'Codice 2FA non valido')
      } else {
        setError(data?.error || 'Email o password non corretti')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" className="h-12 w-auto mb-3" />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: branding.primary_color || '#2563eb' }}>
                <Archive size={24} className="text-white" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{branding.app_name || 'MailVault'}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {requires2fa ? 'Verifica identità' : 'Accedi al tuo archivio email'}
            </p>
          </div>

          {/* Account bloccato */}
          {locked && (
            <div className="mb-6 flex flex-col items-center text-center p-4 bg-red-50 border border-red-200 rounded-xl">
              <Lock size={28} className="text-red-500 mb-2" />
              <p className="text-sm font-semibold text-red-700">Account bloccato</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          )}

          {/* Step 2FA */}
          {requires2fa && !locked && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <ShieldCheck size={32} className="text-blue-500 mb-2" />
                <p className="text-sm text-gray-600 text-center">
                  Apri la tua app di autenticazione e inserisci il codice a 6 cifre
                </p>
              </div>
              <input
                type="text"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required autoFocus placeholder="000000" maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2"
              />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              <button type="submit" disabled={loading || totpCode.length !== 6}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {loading ? 'Verifica...' : 'Verifica codice'}
              </button>
              <button type="button" onClick={() => { setRequires2fa(false); setTotpCode(''); setError('') }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
                ← Torna al login
              </button>
            </form>
          )}

          {/* Form login normale */}
          {!requires2fa && !locked && (
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
                    onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 pr-10" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Accesso in corso...' : 'Accedi'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-6 space-y-0.5">
          {branding.footer_text && (
            <p className="text-xs text-gray-400">{branding.footer_text}</p>
          )}
          <p className="text-xs text-gray-300">by k2tech.it</p>
        </div>
      </div>
    </div>
  )
}
