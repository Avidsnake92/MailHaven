import { useState, useEffect } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { ShieldCheck, ShieldOff, Key, Loader2, Check, X, Lock, Unlock } from 'lucide-react'

export default function Security() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const [me, setMe] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [setupCode, setSetupCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('idle') // idle | setup | verify | disable

  // For admin: locked users
  const [lockedUsers, setLockedUsers] = useState([])

  useEffect(() => {
    api.get('/auth/me').then(r => setMe(r.data)).catch(() => {})
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      loadLockedUsers()
    }
  }, [user])

  const loadLockedUsers = () => {
    api.get('/admin/users').then(r => {
      const locked = r.data.filter(u => u.locked_until && new Date(u.locked_until) > new Date())
      setLockedUsers(locked)
    }).catch(() => {})
  }

  const handleSetup2FA = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/2fa/setup')
      setQrData(res.data)
      setStep('verify')
    } catch (err) { setError(err.response?.data?.error || 'Errore') }
    finally { setLoading(false) }
  }

  const handleVerify2FA = async () => {
    if (setupCode.length !== 6) return
    setLoading(true); setError('')
    try {
      await api.post('/auth/2fa/verify', { code: setupCode })
      setMsg('2FA attivato con successo!')
      setMe({ ...me, totp_enabled: true })
      setStep('idle'); setQrData(null); setSetupCode('')
    } catch (err) { setError(err.response?.data?.error || 'Codice non valido') }
    finally { setLoading(false) }
  }

  const handleDisable2FA = async () => {
    setLoading(true); setError('')
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword })
      setMsg('2FA disattivato')
      setMe({ ...me, totp_enabled: false })
      setStep('idle'); setDisablePassword('')
    } catch (err) { setError(err.response?.data?.error || 'Password non corretta') }
    finally { setLoading(false) }
  }

  const handleUnlock = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/unlock`)
      setMsg('Account sbloccato')
      loadLockedUsers()
    } catch (err) { setError('Errore sblocco') }
    setTimeout(() => { setMsg(''); setError('') }, 3000)
  }

  const handleReset2FA = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/reset-2fa`)
      setMsg('2FA resettato')
    } catch { setError('Errore') }
    setTimeout(() => { setMsg(''); setError('') }, 3000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto h-full overflow-y-auto fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Sicurezza</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestione 2FA e sicurezza account</p>
      </div>

      {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{msg}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* 2FA Section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <ShieldCheck size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Autenticazione a due fattori (2FA)</h2>
          <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${me?.totp_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {me?.totp_enabled ? '✓ Attivo' : 'Non attivo'}
          </span>
        </div>

        <div className="p-6">
          {!me?.totp_enabled && step === 'idle' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Il 2FA aggiunge un livello extra di sicurezza. Avrai bisogno di un'app come <strong>Google Authenticator</strong>, <strong>Authy</strong> o <strong>Microsoft Authenticator</strong>.
              </p>
              <button onClick={handleSetup2FA} disabled={loading}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Attiva 2FA
              </button>
            </div>
          )}

          {step === 'verify' && qrData && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                1. Scansiona il QR code con la tua app di autenticazione
              </p>
              <div className="flex justify-center">
                <img src={qrData.qrDataUrl} alt="QR Code 2FA" className="w-48 h-48 border border-gray-200 rounded-lg p-2" />
              </div>
              <p className="text-sm text-gray-600">
                2. Inserisci il codice a 6 cifre generato dall'app per confermare
              </p>
              <div>
                <input type="text" value={setupCode}
                  onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleVerify2FA} disabled={loading || setupCode.length !== 6}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ background: branding.primary_color || '#2563eb' }}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Conferma e attiva
                </button>
                <button onClick={() => { setStep('idle'); setQrData(null) }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
              </div>
            </div>
          )}

          {me?.totp_enabled && step === 'idle' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Il 2FA è attivo sul tuo account. Per disattivarlo inserisci la tua password.</p>
              <button onClick={() => setStep('disable')}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                <ShieldOff size={14} /> Disattiva 2FA
              </button>
            </div>
          )}

          {step === 'disable' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Inserisci la tua password per confermare la disattivazione del 2FA:</p>
              <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)}
                placeholder="Password attuale"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
              <div className="flex gap-3">
                <button onClick={handleDisable2FA} disabled={loading || !disablePassword}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50 hover:bg-red-700">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                  Disattiva
                </button>
                <button onClick={() => { setStep('idle'); setDisablePassword('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Locked accounts (admin only) */}
      {(user?.role === 'superadmin' || user?.role === 'admin') && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <Lock size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Account Bloccati</h2>
            {lockedUsers.length > 0 && (
              <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                {lockedUsers.length} bloccati
              </span>
            )}
          </div>

          <div className="p-6">
            {lockedUsers.length === 0 ? (
              <div className="text-center py-6">
                <Unlock size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nessun account bloccato</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lockedUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.full_name || u.email}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Bloccato fino: {new Date(u.locked_until).toLocaleString('it-IT')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUnlock(u.id)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                        <Unlock size={12} /> Sblocca
                      </button>
                      {user?.role === 'superadmin' && (
                        <button onClick={() => handleReset2FA(u.id)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                          <Key size={12} /> Reset 2FA
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
