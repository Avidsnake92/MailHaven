import React, { useState, useEffect } from "react"
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Shield, Save, Loader2, RefreshCw, Check, AlertCircle, Mail, Database, SettingsIcon, Puzzle, Download, Copy, Trash2, Plus, ShieldCheck, ShieldOff, Key, Lock, Unlock } from 'lucide-react'

const TABS = [
  { id: 'sync',  label: 'Sincronizzazione', icon: Database },
  { id: 'av',    label: 'Antivirus',         icon: Shield   },
  { id: 'smtp',  label: 'Notifiche Email',   icon: Mail     },
  { id: 'plugin', label: 'Plugin Client',    icon: Puzzle   },
  { id: 'security', label: 'Sicurezza',      icon: ShieldCheck },
  { id: 'update',   label: 'Aggiornamento', icon: RefreshCw },
]

// ═══════════════════════════════════════════════════════
// SecurityTab — 2FA + account bloccati
// ═══════════════════════════════════════════════════════
function SecurityTab({ user }) {
  const [me, setMe] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [setupCode, setSetupCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('idle')
  const [lockedUsers, setLockedUsers] = useState([])

  useEffect(() => {
    api.get('/auth/me').then(r => setMe(r.data)).catch(() => {})
    if (user?.role === 'superadmin' || user?.role === 'admin') loadLockedUsers()
  }, [user])

  const loadLockedUsers = () => {
    api.get('/admin/users').then(r => {
      setLockedUsers(r.data.filter(u => u.locked_until && new Date(u.locked_until) > new Date()))
    }).catch(() => {})
  }

  const handleSetup2FA = async () => {
    setLoading(true); setError('')
    try { const res = await api.post('/auth/2fa/setup'); setQrData(res.data); setStep('verify') }
    catch (err) { setError(err.response?.data?.error || 'Errore') }
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
    try { await api.post(`/admin/users/${userId}/unlock`); setMsg('Account sbloccato'); loadLockedUsers() }
    catch { setError('Errore sblocco') }
    setTimeout(() => { setMsg(''); setError('') }, 3000)
  }

  const handleReset2FA = async (userId) => {
    try { await api.post(`/admin/users/${userId}/reset-2fa`); setMsg('2FA resettato') }
    catch { setError('Errore') }
    setTimeout(() => { setMsg(''); setError('') }, 3000)
  }

  return (
    <div className="space-y-6">
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* 2FA */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
              <p className="text-sm text-gray-600 mb-4">Il 2FA aggiunge sicurezza extra. Usa <strong>Google Authenticator</strong>, <strong>Authy</strong> o simili.</p>
              <button onClick={handleSetup2FA} disabled={loading}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Attiva 2FA
              </button>
            </div>
          )}
          {step === 'verify' && qrData && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">1. Scansiona il QR code con la tua app</p>
              <div className="flex justify-center">
                <img src={qrData.qrDataUrl} alt="QR Code 2FA" className="w-48 h-48 border border-gray-200 rounded-lg p-2" />
              </div>
              <p className="text-sm text-gray-600">2. Inserisci il codice a 6 cifre per confermare</p>
              <input type="text" value={setupCode}
                onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2" />
              <div className="flex gap-3">
                <button onClick={handleVerify2FA} disabled={loading || setupCode.length !== 6}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ background: '#2563eb' }}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Conferma e attiva
                </button>
                <button onClick={() => { setStep('idle'); setQrData(null) }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button>
              </div>
            </div>
          )}
          {me?.totp_enabled && step === 'idle' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Il 2FA è attivo. Per disattivarlo inserisci la tua password.</p>
              <button onClick={() => setStep('disable')}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                <ShieldOff size={14} /> Disattiva 2FA
              </button>
            </div>
          )}
          {step === 'disable' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Inserisci la tua password per confermare:</p>
              <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)}
                placeholder="Password attuale"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
              <div className="flex gap-3">
                <button onClick={handleDisable2FA} disabled={loading || !disablePassword}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50 hover:bg-red-700">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />} Disattiva
                </button>
                <button onClick={() => { setStep('idle'); setDisablePassword('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account bloccati */}
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
                      <p className="text-xs text-red-600 mt-0.5">Bloccato fino: {new Date(u.locked_until).toLocaleString('it-IT')}</p>
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


// UpdateTab — tab aggiornamento da inserire in Settings.jsx
function UpdateTab() {
  const [status, setStatus] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [updating, setUpdating] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [error, setError] = React.useState('')
  const [showChangelog, setShowChangelog] = React.useState(false)
  const [backupConfirmed, setBackupConfirmed] = React.useState(false)
  const [commits, setCommits] = React.useState([])

  const loadStatus = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.get('/update/status')
      setStatus(res.data)
      if (res.data.hasUpdate) {
        const logsRes = await api.get('/update/logs')
        setCommits(logsRes.data)
      }
    } catch (err) {
      setError('Impossibile verificare aggiornamenti: ' + (err.response?.data?.error || err.message))
    }
    setLoading(false)
  }

  const handleUpdate = async () => {
    if (!backupConfirmed) return
    setUpdating(true); setMsg(''); setError('')
    try {
      await api.post('/update/run')
      setMsg('Aggiornamento avviato! Il server si riavvierà a breve. Attendi 2-3 minuti poi ricarica la pagina.')
    } catch (err) {
      setError('Errore durante l\'aggiornamento: ' + (err.response?.data?.error || err.message))
    }
    setUpdating(false)
  }

  // Parsing changelog — mostra solo le ultime 3 versioni
  const parseChangelog = (text) => {
    if (!text) return []
    const sections = text.split(/^## /m).filter(Boolean)
    return sections.slice(0, 3).map(s => {
      const lines = s.trim().split('\n')
      const title = lines[0].trim()
      const body = lines.slice(1).join('\n').trim()
      return { title, body }
    })
  }

  return (
    <div className="space-y-6">
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* Versione corrente */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <RefreshCw size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Versione installata</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Versione</p>
              <p className="font-mono font-bold text-gray-900">{status?.current?.version || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Build</p>
              <p className="font-mono font-bold text-gray-900">{status?.current?.build || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Commit corrente</p>
              <p className="font-mono text-sm text-gray-700">{status?.currentCommit || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Commit remoto</p>
              <p className="font-mono text-sm text-gray-700">{status?.remoteCommit || '—'}</p>
            </div>
          </div>
          <button onClick={loadStatus} disabled={loading}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Verifica aggiornamenti
          </button>
        </div>
      </div>

      {/* Aggiornamento disponibile */}
      {status && status.hasUpdate && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-blue-100">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <h2 className="font-semibold text-blue-900">Aggiornamento disponibile</h2>
            {status.commitsBehind > 0 && (
              <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {status.commitsBehind} commit in ritardo
              </span>
            )}
          </div>
          <div className="p-6 space-y-4">

            {/* Ultimi commit */}
            {commits.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-900 mb-2">Modifiche in arrivo:</p>
                <div className="space-y-1">
                  {commits.map(c => (
                    <div key={c.hash} className="flex items-start gap-2 text-sm">
                      <span className="font-mono text-xs text-blue-400 mt-0.5 shrink-0">{c.hash}</span>
                      <span className="text-blue-800">{c.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Changelog */}
            {status.changelog && (
              <div>
                <button onClick={() => setShowChangelog(s => !s)}
                  className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900">
                  <ChevronDown size={14} className={`transition-transform ${showChangelog ? 'rotate-180' : ''}`} />
                  {showChangelog ? 'Nascondi' : 'Vedi'} changelog completo
                </button>
                {showChangelog && (
                  <div className="mt-3 bg-white border border-blue-100 rounded-lg p-4 space-y-4 max-h-64 overflow-y-auto">
                    {parseChangelog(status.changelog).map((s, i) => (
                      <div key={i}>
                        <p className="font-semibold text-gray-900 text-sm mb-1">{s.title}</p>
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{s.body}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Avviso backup */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Esegui un backup prima di aggiornare</p>
                  <p className="text-xs text-amber-700 mt-1">L'aggiornamento riavvierà il server. Assicurati di aver eseguito un backup recente dalla sezione Backup.</p>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={backupConfirmed} onChange={e => setBackupConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-300" />
                <span className="text-sm font-medium text-amber-800">Ho eseguito un backup e voglio procedere</span>
              </label>
            </div>

            {/* Bottone aggiorna */}
            <button onClick={handleUpdate} disabled={!backupConfirmed || updating}
              className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {updating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {updating ? 'Aggiornamento in corso...' : 'Aggiorna MailHaven'}
            </button>
          </div>
        </div>
      )}

      {/* Sistema aggiornato */}
      {status && !status.hasUpdate && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-center gap-4">
          <ShieldCheck size={24} className="text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-900">MailHaven è aggiornato</p>
            <p className="text-sm text-green-700 mt-0.5">Stai usando l'ultima versione disponibile.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('sync')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [msgType, setMsgType]     = useState('ok')

  // Sync
  const [syncInterval, setSyncInterval] = useState('15')
  const [syncEnabled, setSyncEnabled]   = useState(true)

  // AV
  const [avUpdateSchedule, setAvUpdateSchedule]           = useState('24')
  const [avUpdateTime, setAvUpdateTime]                   = useState('02:00')
  const [avScanOnOpen, setAvScanOnOpen]                   = useState(true)
  const [avNotifyOnInfection, setAvNotifyOnInfection]     = useState(false)
  const [updatingAv, setUpdatingAv]                       = useState(false)

  // SMTP
  const [smtpHost, setSmtpHost]       = useState('')
  const [smtpPort, setSmtpPort]       = useState('465')
  const [smtpSecure, setSmtpSecure]   = useState(true)
  const [smtpUser, setSmtpUser]       = useState('')
  const [smtpPass, setSmtpPass]       = useState('')
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [pluginTokens, setPluginTokens] = useState([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [serverUrl, setServerUrl] = useState('')

  useEffect(() => {
    if (activeTab === 'plugin') loadPluginTokens()
  }, [activeTab])

  const loadPluginTokens = async () => {
    setLoadingTokens(true)
    try {
      const res = await api.get('/plugin/tokens')
      setPluginTokens(res.data || [])
    } catch {} finally { setLoadingTokens(false) }
  }

  const generateToken = async (clientType) => {
    try {
      const res = await api.post('/plugin/tokens', {
        name: clientType === 'outlook' ? 'Outlook Add-in' : 'Thunderbird Extension',
        client_type: clientType,
        expires_days: 365
      })
      setPluginTokens(prev => [res.data, ...prev])
    } catch (e) { showMsg('Errore generazione token', 'error') }
  }

  const revokeToken = async (id) => {
    try {
      await api.delete(`/plugin/tokens/${id}`)
      setPluginTokens(prev => prev.filter(t => t.id !== id))
      showMsg('Token revocato')
    } catch { showMsg('Errore revoca', 'error') }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    showMsg('Copiato!')
  }

  useEffect(() => {
    api.get('/admin/settings').then(res => {
      const s = res.data
      if (s.sync_interval_minutes) setSyncInterval(s.sync_interval_minutes)
      if (s.sync_enabled !== undefined) setSyncEnabled(s.sync_enabled === 'true')
      if (s.av_update_hours) setAvUpdateSchedule(s.av_update_hours)
      if (s.av_update_time) setAvUpdateTime(s.av_update_time)
      if (s.av_scan_on_open !== undefined) setAvScanOnOpen(s.av_scan_on_open === 'true')
      if (s.av_notify_on_infection !== undefined) setAvNotifyOnInfection(s.av_notify_on_infection === 'true')
      if (s.smtp_host) setSmtpHost(s.smtp_host)
      if (s.smtp_port) setSmtpPort(s.smtp_port)
      if (s.smtp_secure !== undefined) setSmtpSecure(s.smtp_secure === 'true')
      if (s.smtp_user) setSmtpUser(s.smtp_user)
    }).catch(() => {})
  }, [])

  const showMsg = (text, type = 'ok') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 3000)
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      await api.post('/admin/settings', {
        sync_interval_minutes:   syncInterval,
        sync_enabled:            String(syncEnabled),
        av_update_hours:         avUpdateSchedule,
        av_update_time:          avUpdateTime,
        av_scan_on_open:         String(avScanOnOpen),
        av_notify_on_infection:  String(avNotifyOnInfection),
        smtp_host:               smtpHost,
        smtp_port:               smtpPort,
        smtp_secure:             String(smtpSecure),
        smtp_user:               smtpUser,
        ...(smtpPass ? { smtp_pass: smtpPass } : {}),
      })
      api.post('/admin/av/restart-scheduler').catch(() => {})
      showMsg('Impostazioni salvate!')
    } catch { showMsg('Errore durante il salvataggio', 'error') }
    finally { setSaving(false) }
  }

  const updateAvNow = async () => {
    setUpdatingAv(true)
    try {
      await api.post('/admin/av/update')
      showMsg('Database ClamAV aggiornato!')
    } catch { showMsg('Errore aggiornamento AV', 'error') }
    finally { setUpdatingAv(false) }
  }

  const testSmtp = async () => {
    setTestingSmtp(true)
    try {
      await api.post('/admin/smtp/test', { smtp_host: smtpHost, smtp_port: smtpPort, smtp_secure: smtpSecure, smtp_user: smtpUser, smtp_pass: smtpPass })
      showMsg('Email di test inviata!')
    } catch (e) { showMsg(e.response?.data?.error || 'Errore SMTP', 'error') }
    finally { setTestingSmtp(false) }
  }

  const Toggle = ({ checked, onChange, label, description }) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}>
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'left-5' : 'left-1'}`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  )

  const Field = ({ label, children }) => (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )

  const selectClass = "text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
  const inputClass  = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon size={20} className="text-gray-500" /> Impostazioni
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Configurazione del sistema MailHaven</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">

        {/* SYNC */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            <Toggle
              checked={syncEnabled}
              onChange={setSyncEnabled}
              label="Sincronizzazione automatica"
              description="Abilita il crawler IMAP periodico su tutte le caselle attive"
            />
            <Field label="Intervallo di sincronizzazione">
              <select value={syncInterval} onChange={e => setSyncInterval(e.target.value)} className={selectClass}>
                <option value="5">Ogni 5 minuti</option>
                <option value="10">Ogni 10 minuti</option>
                <option value="15">Ogni 15 minuti</option>
                <option value="30">Ogni 30 minuti</option>
                <option value="60">Ogni ora</option>
                <option value="360">Ogni 6 ore</option>
                <option value="720">Ogni 12 ore</option>
                <option value="1440">Una volta al giorno</option>
              </select>
            </Field>
          </div>
        )}

        {/* ANTIVIRUS */}
        {activeTab === 'av' && (
          <div className="space-y-6">
            <Toggle
              checked={avScanOnOpen}
              onChange={setAvScanOnOpen}
              label="Scansione automatica all'apertura"
              description="Scansiona gli allegati quando si apre un'email"
            />
            <Toggle
              checked={avNotifyOnInfection}
              onChange={setAvNotifyOnInfection}
              label="Notifica via email in caso di virus"
              description="Invia una notifica all'amministratore se viene rilevato un virus"
            />
            <div className="border-t border-gray-100 pt-6">
              <Field label="Aggiornamento automatico database virus">
                <div className="flex items-center gap-3 flex-wrap mt-1.5">
                  <select value={avUpdateSchedule} onChange={e => setAvUpdateSchedule(e.target.value)} className={selectClass}>
                    <option value="6">Ogni 6 ore</option>
                    <option value="12">Ogni 12 ore</option>
                    <option value="24">Ogni 24 ore</option>
                    <option value="0">Disabilitato</option>
                  </select>
                  {avUpdateSchedule !== '0' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">a partire dalle</span>
                      <input type="time" value={avUpdateTime} onChange={e => setAvUpdateTime(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                </div>
                {avUpdateSchedule !== '0' && (
                  <p className="text-xs text-gray-400 mt-2">
                    {avUpdateSchedule === '6'  && `Aggiornamento alle ${avUpdateTime}, poi ogni 6 ore`}
                    {avUpdateSchedule === '12' && `Aggiornamento alle ${avUpdateTime}, poi ogni 12 ore`}
                    {avUpdateSchedule === '24' && `Aggiornamento ogni giorno alle ${avUpdateTime}`}
                  </p>
                )}
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={updateAvNow} disabled={updatingAv}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-blue-500 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-60 transition-colors">
                {updatingAv ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {updatingAv ? 'Aggiornamento...' : 'Aggiorna database ora'}
              </button>
              <span className="text-xs text-gray-400">Forza aggiornamento immediato del database ClamAV</span>
            </div>
          </div>
        )}

        {/* PLUGIN */}
        {activeTab === 'security' && <SecurityTab user={user} />}
        {activeTab === 'update' && <UpdateTab />}
        {activeTab === 'plugin' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Plugin per client email</h3>
              <p className="text-xs text-gray-500 mb-4">
                Installa il plugin nel tuo client email per accedere all'archivio MailHaven direttamente da Outlook o Thunderbird.
              </p>

              {/* Download plugin */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <a href={`${window.location.origin.replace(':8080',':3001')}/plugin/outlook/manifest.xml`}
                  download="mailvault-outlook-manifest.xml"
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
                  <img src="/outlook-icon.png" className="w-12 h-12 object-contain" alt="Outlook" />
                  <span className="text-sm font-semibold text-gray-800">Outlook Add-in</span>
                  <span className="text-xs text-gray-500">Scarica manifest XML</span>
                </a>
                <a href={`${window.location.origin.replace(':8080',':3001')}/plugin/thunderbird/manifest.json`}
                  download="mailvault-thunderbird.json"
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
                  <img src="/thunderbird-icon.png" className="w-12 h-12 object-contain" alt="Thunderbird" />
                  <span className="text-sm font-semibold text-gray-800">Thunderbird</span>
                  <span className="text-xs text-gray-500">Scarica estensione</span>
                </a>
              </div>

              {/* Istruzioni */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-6">
                <p className="font-semibold mb-1">Come installare:</p>
                <p><b>Outlook:</b> File → Gestisci componenti aggiuntivi → Carica manifest XML</p>
                <p className="mt-1"><b>Thunderbird:</b> Strumenti → Componenti aggiuntivi → Installa da file</p>
              </div>

              {/* Token manager */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Token di accesso</h3>
                  <div className="flex gap-2">
                    <button onClick={() => generateToken('outlook')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <Plus size={12} /> Outlook
                    </button>
                    <button onClick={() => generateToken('thunderbird')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <Plus size={12} /> Thunderbird
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3">I token permettono ai plugin di accedere all'archivio senza reinserire la password ogni volta.</p>

                {loadingTokens ? (
                  <div className="text-center py-4 text-gray-400 text-sm">Caricamento...</div>
                ) : pluginTokens.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">Nessun token generato. I token vengono creati automaticamente al primo accesso dal plugin.</div>
                ) : (
                  <div className="space-y-2">
                    {pluginTokens.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-gray-800">{t.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              t.client_type === 'outlook' ? 'bg-blue-100 text-blue-700' :
                              t.client_type === 'thunderbird' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{t.client_type}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Scade: {new Date(t.expires_at).toLocaleDateString('it-IT')}
                            {t.last_used_at && ` · Usato: ${new Date(t.last_used_at).toLocaleDateString('it-IT')}`}
                          </div>
                        </div>
                        <button onClick={() => revokeToken(t.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SMTP */}
        {activeTab === 'smtp' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Server SMTP">
                  <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                    placeholder="mail.tuodominio.it" className={inputClass} />
                </Field>
              </div>
              <Field label="Porta">
                <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  className={inputClass} />
              </Field>
            </div>
            <Field label="Username">
              <input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                placeholder="notifiche@tuodominio.it" className={inputClass} />
            </Field>
            <Field label="Password">
              <input type="password" id="smtp-pass-field" defaultValue={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                placeholder="••••••••" className={inputClass} autoComplete="new-password" />
            </Field>
            <Toggle
              checked={smtpSecure}
              onChange={setSmtpSecure}
              label="SSL/TLS"
              description="Usa connessione sicura (porta 465)"
            />
            {smtpHost && (
              <button onClick={testSmtp} disabled={testingSmtp}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors">
                {testingSmtp ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {testingSmtp ? 'Invio...' : 'Invia email di test'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-4 mt-6">
        <button onClick={saveSettings} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60 bg-blue-600 hover:bg-blue-700 transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>
        {msg && (
          <span className={`flex items-center gap-1.5 text-sm font-medium ${msgType === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msgType === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}
