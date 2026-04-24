import { useState, useEffect, useRef } from 'react'
import {
  Archive, Key, User, CheckCircle, RefreshCw, Copy, Check,
  Eye, EyeOff, ChevronRight, ShieldCheck, Loader2, AlertCircle,
  Mail, ChevronLeft
} from 'lucide-react'
import api from '../services/api'

const PRIMARY = '#2563eb'
const APP_NAME = 'MailHaven'

const STEPS = [
  { label: 'Benvenuto',      icon: ShieldCheck },
  { label: 'Sicurezza',      icon: Key         },
  { label: 'Amministratore', icon: User        },
  { label: 'Email (SMTP)',   icon: Mail        },
  { label: 'Completato',     icon: CheckCircle },
]

export default function Setup() {
  const [step, setStep]       = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState({})

  // Step 1 — Sicurezza
  const [encKey, setEncKey]       = useState('')
  const [jwtSecret, setJwtSecret] = useState('')

  // Step 2 — Admin
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName]   = useState('')
  const [adminPwd, setAdminPwd]     = useState('')
  const [adminPwd2, setAdminPwd2]   = useState('')
  const [showPwd, setShowPwd]       = useState(false)

  // Step 3 — SMTP
  const [smtpHost, setSmtpHost]       = useState('')
  const [smtpPort, setSmtpPort]       = useState('465')
  const [smtpSecure, setSmtpSecure]   = useState(true)
  const [smtpUser, setSmtpUser]       = useState('')
  const [smtpPass, setSmtpPass]       = useState('')
  const [showSmtpPwd, setShowSmtpPwd] = useState(false)
  const [testingSMTP, setTestingSMTP] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState(null)

  // Step 4 — Countdown
  const [countdown, setCountdown] = useState(60)
  const countdownRef = useRef(null)

  useEffect(() => { generateKeys() }, [])

  useEffect(() => {
    if (step === 4) {
      setCountdown(60)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current)
            window.location.replace('/login')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [step])

  const generateKeys = async () => {
    try {
      const res = await api.get('/setup/generate-keys')
      setEncKey(res.data.encryption_keys[0])
      setJwtSecret(res.data.jwt_secret)
    } catch {
      const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      setEncKey(rand())
      setJwtSecret(rand())
    }
  }

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopied(p => ({ ...p, [id]: true }))
    setTimeout(() => setCopied(p => ({ ...p, [id]: false })), 2000)
  }

  const pwdStrength = (p) => {
    if (!p) return 0
    let s = 0
    if (p.length >= 8)  s++
    if (p.length >= 12) s++
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  }
  const strength = pwdStrength(adminPwd)
  const strengthLabel = ['', 'Debole', 'Discreta', 'Buona', 'Ottima'][strength]
  const strengthColor  = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'][strength]

  const validateStep = (s) => {
    if (s === 1) {
      if (!encKey || encKey.length !== 64 || !/^[0-9a-f]+$/i.test(encKey))
        return 'ENCRYPTION_KEY non valida'
    }
    if (s === 2) {
      if (!adminEmail || !adminEmail.includes('@')) return 'Email non valida'
      if (!adminPwd || adminPwd.length < 8) return 'Password troppo corta (minimo 8 caratteri)'
      if (adminPwd !== adminPwd2) return 'Le password non coincidono'
    }
    return ''
  }

  const handleNext = async () => {
    setError('')
    const err = validateStep(step)
    if (err) { setError(err); return }
    if (step === 3) { await handleComplete(); return }
    setStep(s => s + 1)
  }

  const handleComplete = async (skipSmtp = false) => {
    setLoading(true)
    setError('')
    try {
      await api.post('/setup/complete', {
        encryption_key: encKey,
        jwt_secret:     jwtSecret,
        admin_email:    adminEmail,
        admin_password: adminPwd,
        admin_name:     adminName,
        smtp_host:      skipSmtp ? undefined : smtpHost || undefined,
        smtp_port:      smtpPort,
        smtp_secure:    String(smtpSecure),
        smtp_user:      smtpUser || undefined,
        smtp_pass:      smtpPass || undefined,
      })
      setStep(4)
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante il setup')
    } finally {
      setLoading(false)
    }
  }

  const testSMTP = async () => {
    setTestingSMTP(true)
    setSmtpTestResult(null)
    try {
      await api.post('/setup/test-smtp', {
        smtp_host: smtpHost, smtp_port: smtpPort,
        smtp_secure: smtpSecure, smtp_user: smtpUser,
        smtp_pass: smtpPass, to: adminEmail,
      })
      setSmtpTestResult({ ok: true, msg: 'Email di test inviata a ' + adminEmail })
    } catch (err) {
      setSmtpTestResult({ ok: false, msg: err.response?.data?.error || 'Connessione fallita' })
    } finally {
      setTestingSMTP(false)
    }
  }

  const ErrorBox = () => error ? (
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mt-4 flex gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
    </div>
  ) : null

  // ── STEP 4 fullscreen stile Synology ───────────────────────────────────────
  if (step === 4) {
    const radius = 120
    const circumference = 2 * Math.PI * radius
    const progress = circumference - (circumference * countdown / 60)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)' }}>
        <p className="text-white text-2xl font-semibold mb-16 tracking-wide">
          {APP_NAME} si sta riavviando...
        </p>

        {/* Cerchio sottile stile Synology */}
        <div className="relative" style={{ width: 300, height: 300 }}>
          <svg width="300" height="300" viewBox="0 0 300 300" className="-rotate-90">
            {/* Cerchio sfondo — bianco trasparente */}
            <circle cx="150" cy="150" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3" />
            {/* Cerchio progresso — bianco */}
            <circle cx="150" cy="150" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {/* Countdown al centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-7xl font-thin text-white">{countdown}</span>
            <span className="text-sm text-white/60 mt-2 tracking-widest uppercase">secondi</span>
          </div>
        </div>

        <p className="text-white/50 text-sm mt-16 mb-6">
          Verrai reindirizzato al login automaticamente
        </p>

        <button onClick={() => window.location.replace('/login')}
          className="px-6 py-2.5 rounded-full border border-white/30 text-white/70 text-sm hover:bg-white/10 transition-colors">
          Vai subito al login
        </button>
      </div>
    )
  }

  // ── Layout wizard normale ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg">
            <Archive size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="text-sm text-gray-400 mt-1">Configurazione iniziale</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-1.5 flex-wrap">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  i === step  ? 'bg-blue-600 text-white' :
                  i < step    ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i < step ? <Check size={11} /> : <Icon size={11} />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
              </div>
            )
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* STEP 0 — Benvenuto */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={32} className="text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Benvenuto in {APP_NAME}</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Questo wizard ti guida nella configurazione iniziale.<br />
                Ci vogliono circa 2 minuti.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-8 text-left">
                {[
                  { icon: Key,  title: 'Chiavi',  desc: 'AES-256 & JWT per la sicurezza dei dati' },
                  { icon: User, title: 'Admin',   desc: 'Il tuo account superamministratore'      },
                  { icon: Mail, title: 'SMTP',    desc: 'Notifiche email (opzionale)'             },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="p-4 bg-gray-50 rounded-xl">
                    <Icon size={18} className="text-blue-500 mb-2" />
                    <p className="text-sm font-semibold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-500 mt-1">{desc}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                Inizia la configurazione <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* STEP 1 — Sicurezza */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Key size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Chiave di sicurezza</h2>
                  <p className="text-sm text-gray-500">Copia e salva questa chiave in un posto sicuro</p>
                </div>
              </div>

              {/* Chiave singola con copia e rigenera */}
              <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                    ENCRYPTION_KEY
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => copyText(encKey, 'enc')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                      {copied['enc'] ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      {copied['enc'] ? 'Copiata!' : 'Copia'}
                    </button>
                    <button type="button" onClick={generateKeys}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                      <RefreshCw size={11} /> Genera nuova
                    </button>
                  </div>
                </div>
                <code className="text-xs break-all text-gray-700 font-mono leading-relaxed block">{encKey}</code>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span><strong>Importante:</strong> salva questa chiave in un posto sicuro. Se la perdi non potrai più decifrare le password IMAP archiviate.</span>
              </div>

              <ErrorBox />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(0)} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 flex items-center gap-1.5">
                  <ChevronLeft size={15} /> Indietro
                </button>
                <button onClick={handleNext}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
                  Continua <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Amministratore */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <User size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Account amministratore</h2>
                  <p className="text-sm text-gray-500">Crea le credenziali per il primo accesso</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
                  <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)}
                    placeholder="Mario Rossi"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                    placeholder="admin@tuaazienda.it" required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={adminPwd}
                      onChange={e => setAdminPwd(e.target.value)}
                      placeholder="Minimo 8 caratteri" required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {adminPwd && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${strength >= i ? strengthColor : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">Sicurezza: <span className="font-medium">{strengthLabel}</span></p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Conferma password <span className="text-red-500">*</span></label>
                  <input type={showPwd ? 'text' : 'password'} value={adminPwd2}
                    onChange={e => setAdminPwd2(e.target.value)}
                    placeholder="Ripeti la password" required
                    className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      adminPwd2 && adminPwd !== adminPwd2 ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`} />
                  {adminPwd2 && adminPwd !== adminPwd2 && (
                    <p className="text-xs text-red-500 mt-1">Le password non coincidono</p>
                  )}
                </div>
              </div>
              <ErrorBox />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 flex items-center gap-1.5">
                  <ChevronLeft size={15} /> Indietro
                </button>
                <button onClick={handleNext}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
                  Continua <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — SMTP */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <Mail size={20} className="text-orange-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Configurazione SMTP</h2>
                  <p className="text-sm text-gray-500">Opzionale — per notifiche email di sicurezza</p>
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex gap-2 mb-5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Puoi saltare questo step e configurare lo SMTP in seguito dalle Impostazioni.</span>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Server SMTP</label>
                    <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                      placeholder="mail.tuodominio.it"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Porta</label>
                    <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                  <input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                    placeholder="notifiche@tuodominio.it"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password SMTP</label>
                  <div className="relative">
                    <input type={showSmtpPwd ? 'text' : 'password'} value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                    <button type="button" onClick={() => setShowSmtpPwd(!showSmtpPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showSmtpPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-700">SSL/TLS (porta 465)</span>
                </label>
                {smtpHost && (
                  <div>
                    <button type="button" onClick={testSMTP} disabled={testingSMTP}
                      className="flex items-center gap-2 px-4 py-2 border-2 border-blue-500 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-60">
                      {testingSMTP ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      {testingSMTP ? 'Invio in corso...' : 'Invia email di test'}
                    </button>
                    {smtpTestResult && (
                      <div className={`mt-2 p-2.5 rounded-lg text-xs flex gap-2 ${
                        smtpTestResult.ok
                          ? 'bg-green-50 border border-green-200 text-green-700'
                          : 'bg-red-50 border border-red-200 text-red-700'
                      }`}>
                        {smtpTestResult.ok ? <Check size={13} /> : <AlertCircle size={13} />}
                        {smtpTestResult.msg}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <ErrorBox />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 flex items-center gap-1.5">
                  <ChevronLeft size={15} /> Indietro
                </button>
                <button onClick={() => handleComplete(true)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
                  Salta
                </button>
                <button onClick={handleNext} disabled={loading}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Configurazione...</> : <>Completa setup <ChevronRight size={16} /></>}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-0.5">
          <p className="text-xs text-gray-400">{APP_NAME} — Email Archiving</p>
          <p className="text-xs text-gray-300">by k2tech.it</p>
        </div>
      </div>
    </div>
  )
}
