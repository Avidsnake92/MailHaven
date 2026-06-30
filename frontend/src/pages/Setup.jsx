import { useState, useEffect } from 'react'
import {
  Archive, Key, User, CheckCircle, RefreshCw, Copy, Check,
  Eye, EyeOff, ChevronRight, ShieldCheck, Loader2, AlertCircle,
  Mail, ChevronLeft, Lock, Globe
} from 'lucide-react'
import api from '../services/api'

const APP_NAME = 'MailHaven'

const STEPS = [
  { label: 'Benvenuto',      desc: 'Iniziamo',                 icon: ShieldCheck },
  { label: 'Sicurezza',      desc: 'Chiave di cifratura',      icon: Key         },
  { label: 'Amministratore', desc: 'Il tuo account',           icon: User        },
  { label: 'Email (SMTP)',   desc: 'Notifiche (opzionale)',    icon: Mail        },
  { label: 'Completato',     desc: 'Tutto pronto',             icon: CheckCircle },
]

export default function Setup({ preview = false }) {
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
  const [appUrl, setAppUrl]         = useState('')
  const [smtpHost, setSmtpHost]       = useState('')
  const [smtpPort, setSmtpPort]       = useState('465')
  const [smtpSecure, setSmtpSecure]   = useState(true)
  const [smtpUser, setSmtpUser]       = useState('')
  const [smtpPass, setSmtpPass]       = useState('')
  const [showSmtpPwd, setShowSmtpPwd] = useState(false)
  const [testingSMTP, setTestingSMTP] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState(null)

  // Step 4 — Riavvio (polling /api/health invece di countdown fisso)
  const [restartState, setRestartState] = useState('restarting') // 'restarting' | 'ready'

  // Caps Lock hint sui campi password
  const [capsOn, setCapsOn] = useState(false)
  const handleCaps = (e) => { try { setCapsOn(e.getModifierState && e.getModifierState('CapsLock')) } catch {} }

  // URL pubblico rilevato dal browser (suggerimento per lo step SMTP)
  const detectedUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => { generateKeys() }, [])

  // Allo step finale, attendo che il backend si riavvii davvero: sondo /api/health
  // e reindirizzo appena è di nuovo online (con tetto di sicurezza), invece di
  // aspettare 60s fissi (che sprecano tempo o mandano su un login non pronto).
  useEffect(() => {
    if (step !== 4) return
    let cancelled = false
    let seenDown = false
    const startedAt = Date.now()
    const MAX_WAIT = 90000
    const goLogin = () => { if (!cancelled) window.location.replace('/login') }

    const poll = async () => {
      if (cancelled) return
      const elapsed = Date.now() - startedAt
      let up = false
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        up = r.ok
      } catch { up = false }

      if (!up) seenDown = true
      // Pronto se il backend è tornato su dopo essere caduto, oppure se è
      // passato abbastanza tempo da garantire che il riavvio sia avvenuto.
      if (up && (seenDown || elapsed > 15000)) {
        if (!cancelled) { setRestartState('ready'); setTimeout(goLogin, 1200) }
        return
      }
      if (elapsed > MAX_WAIT) { goLogin(); return }
      if (!cancelled) setTimeout(poll, 2000)
    }

    setRestartState('restarting')
    const t = setTimeout(poll, 3000) // ~3s perché il backend faccia process.exit
    return () => { cancelled = true; clearTimeout(t) }
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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
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

  const exitPreview = async () => {
    try { await api.post('/setup/preview', { on: false }) } catch {}
    window.location.href = '/'
  }

  const handleComplete = async (skipSmtp = false) => {
    if (preview) { setStep(4); return }   // anteprima dev: nessuna scrittura
    setLoading(true)
    setError('')
    try {
      await api.post('/setup/complete', {
        encryption_key: encKey,
        jwt_secret:     jwtSecret,
        admin_email:    adminEmail,
        admin_password: adminPwd,
        admin_name:     adminName,
        app_url:        appUrl.trim() || undefined,
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

  // ── STEP 4 — Schermata finale fullscreen (attende il riavvio reale) ─────────
  if (step === 4) {
    const ready = restartState === 'ready'
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #2563eb 100%)' }}>
        {/* alone luminoso di sfondo */}
        <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          {/* Indicatore: spinner durante il riavvio, spunta quando pronto */}
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 ring-1 transition-colors duration-500 ${
            ready ? 'bg-emerald-400/15 ring-emerald-300/40' : 'bg-white/5 ring-white/15'
          }`}>
            {ready
              ? <CheckCircle size={48} className="text-emerald-300" />
              : <Loader2 size={48} className="text-white/90 animate-spin" />}
          </div>

          <p className="text-white text-2xl font-semibold mb-3 tracking-wide">
            {ready ? 'Tutto pronto!' : `${APP_NAME} si sta riavviando…`}
          </p>
          <p className="text-white/55 text-sm mb-12 max-w-sm">
            {ready
              ? 'Reindirizzamento alla pagina di login…'
              : 'Attendo che il servizio torni online. Ci vuole circa un minuto, non chiudere questa pagina.'}
          </p>

          <button onClick={() => window.location.replace('/login')}
            className="px-6 py-2.5 rounded-full border border-white/30 text-white/80 text-sm hover:bg-white/10 transition-colors">
            Vai subito al login
          </button>
        </div>
      </div>
    )
  }

  // ── Pannello brand a sinistra (stepper verticale) ──────────────────────────
  const BrandPanel = (
    <div className="relative hidden lg:flex lg:w-[38%] xl:w-1/3 flex-col justify-between p-10 overflow-hidden text-white"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)' }}>
      {/* aloni decorativi */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)' }} />
      <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />

      {/* Logo + nome */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <Archive size={22} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
        </div>
        <p className="text-white/60 text-sm ml-[3.6rem]">Configurazione iniziale</p>
      </div>

      {/* Stepper verticale */}
      <div className="relative z-10 space-y-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = i < step
          const active = i === step
          return (
            <div key={i} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                  active ? 'bg-white text-blue-700 ring-4 ring-white/25 scale-105'
                  : done ? 'bg-emerald-400/90 text-white'
                  : 'bg-white/10 text-white/50 ring-1 ring-white/15'
                }`}>
                  {done ? <Check size={16} /> : <Icon size={16} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-0.5 h-7 my-1 rounded-full transition-colors ${done ? 'bg-emerald-400/70' : 'bg-white/15'}`} />
                )}
              </div>
              <div className={`pt-1 transition-opacity ${active ? 'opacity-100' : 'opacity-65'}`}>
                <p className={`text-sm font-semibold leading-tight ${active ? 'text-white' : 'text-white/80'}`}>{s.label}</p>
                <p className="text-xs text-white/45 mt-0.5">{s.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer brand */}
      <div className="relative z-10 flex items-center gap-2 text-white/40 text-xs">
        <Lock size={12} /> Archiviazione email cifrata · by k2tech.it
      </div>
    </div>
  )

  // ── Header compatto del singolo step (riusato a destra) ─────────────────────
  const StepHeader = ({ icon: Icon, tint, title, subtitle }) => (
    <div className="flex items-center gap-3 mb-6">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
        <Icon size={20} />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
  )

  // ── Layout principale split-screen ─────────────────────────────────────────
  return (
    <>
    {preview && (
      <div className="bg-amber-500 text-white text-sm text-center py-2 px-4 font-medium flex items-center justify-center gap-3" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <span>Anteprima wizard (dev) — il completamento è disattivato: nessuna modifica verrà salvata.</span>
        <button onClick={exitPreview} className="underline shrink-0 hover:text-amber-100">Esci anteprima</button>
      </div>
    )}
    <div className="min-h-screen flex bg-white" style={preview ? { paddingTop: '38px' } : undefined}>
      {BrandPanel}

      {/* Colonna form */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 bg-gradient-to-br from-slate-50 to-blue-50/40">

        {/* Progress mobile (il pannello brand è nascosto sotto lg) */}
        <div className="lg:hidden w-full max-w-md mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Archive size={18} className="text-blue-600" />
            <span className="font-bold text-gray-800">{APP_NAME}</span>
            <span className="ml-auto text-xs text-gray-400">Passo {step + 1} di {STEPS.length}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-7 sm:p-8">

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
                <div className="space-y-2.5 mb-8 text-left">
                  {[
                    { icon: Key,  title: 'Chiave di cifratura', desc: 'AES-256 & JWT per proteggere i dati' },
                    { icon: User, title: 'Amministratore',      desc: 'Il tuo account superadmin'           },
                    { icon: Mail, title: 'SMTP',                desc: 'Notifiche email (opzionale)'         },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-gray-200 flex items-center justify-center shrink-0">
                        <Icon size={17} className="text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{title}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
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
                <StepHeader icon={Key} tint="bg-blue-50 text-blue-600"
                  title="Chiave di sicurezza" subtitle="Copia e salva questa chiave in un posto sicuro" />

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
                <StepHeader icon={User} tint="bg-green-50 text-green-600"
                  title="Account amministratore" subtitle="Crea le credenziali per il primo accesso" />
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
                        onKeyUp={handleCaps} onKeyDown={handleCaps}
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
                    {capsOn && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={12} /> Caps Lock attivo
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Conferma password <span className="text-red-500">*</span></label>
                    <input type={showPwd ? 'text' : 'password'} value={adminPwd2}
                      onChange={e => setAdminPwd2(e.target.value)}
                      onKeyUp={handleCaps} onKeyDown={handleCaps}
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
                <StepHeader icon={Mail} tint="bg-orange-50 text-orange-500"
                  title="Configurazione SMTP" subtitle="Opzionale — per notifiche email di sicurezza" />
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex gap-2 mb-5">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>Puoi saltare questo step e configurare lo SMTP in seguito dalle Impostazioni.</span>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl mb-5 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">URL pubblico applicazione <span className="text-gray-400 font-normal">(opzionale)</span></label>
                    <input type="url" value={appUrl} onChange={e => setAppUrl(e.target.value)}
                      placeholder="https://mailhaven.tuodominio.it"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Necessario per OAuth (Microsoft 365 / Google) e per accesso esterno. Lascia vuoto per installazioni solo interne.
                    </p>
                    {detectedUrl && appUrl.trim() !== detectedUrl && (
                      <button type="button" onClick={() => setAppUrl(detectedUrl)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline">
                        <Globe size={12} /> Usa l'indirizzo rilevato: {detectedUrl}
                      </button>
                    )}
                  </div>
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
    </div>
    </>
  )
}
