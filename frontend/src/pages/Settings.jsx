import React, { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Shield, Save, Loader2, RefreshCw, Check, AlertCircle, Mail, Database, Settings as SettingsIcon, Puzzle, Download, Copy, Trash2, Plus, ShieldCheck, ShieldOff, Key, Lock, Unlock, ChevronDown, AlertTriangle, CheckCircle2, ArrowDownCircle, Cloud, ChevronRight, ExternalLink, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react'

const TABS = [
  { id: 'sync',     label: 'Sincronizzazione', icon: Database    },
  { id: 'av',       label: 'Antivirus',         icon: Shield      },
  { id: 'smtp',     label: 'Notifiche Email',   icon: Mail        },
  { id: 'plugin',   label: 'Plugin Client',     icon: Puzzle      },
  { id: 'security', label: 'Sicurezza',         icon: ShieldCheck },
  { id: 'update',   label: 'Aggiornamento',     icon: RefreshCw   },
  { id: 'oauth',    label: 'OAuth / Cloud',     icon: Cloud       },
]

// ═══════════════════════════════════════════════════════
// SecurityTab
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

// ═══════════════════════════════════════════════════════
// UpdateTab — con animazioni, barra progresso, avviso backup
// ═══════════════════════════════════════════════════════
const UPDATE_STEPS = [
  { id: 'fetch',   label: 'Download aggiornamenti',   duration: 30  },
  { id: 'install', label: 'Installazione dipendenze', duration: 60  },
  { id: 'build',   label: 'Compilazione frontend',    duration: 120 },
  { id: 'restart', label: 'Riavvio servizi',          duration: 30  },
  { id: 'done',    label: 'Aggiornamento completato', duration: 10  },
]
const TOTAL_DURATION = UPDATE_STEPS.reduce((a, s) => a + s.duration, 0)



function UpdateProgress({ startVersion, onComplete }) {
  const [progress, setProgress] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000)
      setElapsed(secs)
      setProgress(Math.min(Math.round((secs / TOTAL_DURATION) * 100), 99))
      let acc = 0
      for (let i = 0; i < UPDATE_STEPS.length; i++) {
        acc += UPDATE_STEPS[i].duration
        if (secs < acc) { setStepIndex(i); break }
        setStepIndex(UPDATE_STEPS.length - 1)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        // Legge version.json direttamente — più affidabile di /api/health
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        const data = await res.json()
        if (startVersion && data.version && data.version !== startVersion) {
          setDone(true); setProgress(100)
          clearInterval(poll)
          setTimeout(() => window.location.reload(), 2000)
        }
      } catch {
        // Backend non raggiungibile — normale durante riavvio, aspetta
      }
    }, 8000)
    const timeout = setTimeout(() => { clearInterval(poll); window.location.reload() }, 6 * 60 * 1000)
    return () => { clearInterval(poll); clearTimeout(timeout) }
  }, [startVersion])

  const remaining = Math.max(0, TOTAL_DURATION - elapsed)

  return (
    <div className="space-y-5 py-2">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          {done ? <CheckCircle2 size={22} className="text-green-600" /> : <RefreshCw size={22} className="text-blue-600 animate-spin" />}
        </div>
        <h2 className="text-base font-bold text-gray-900">{done ? 'Completato! Ricarico...' : 'Aggiornamento in corso...'}</h2>
        {!done && <p className="text-xs text-gray-400 mt-1">Rimanente: ~{Math.floor(remaining/60)}m {remaining%60}s</p>}
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{done ? 'Completato' : UPDATE_STEPS[stepIndex]?.label}</span>
          <span className="font-semibold" style={{color: done ? '#16a34a' : '#2563eb'}}>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{
            width: `${progress}%`,
            background: done ? 'linear-gradient(90deg,#16a34a,#22c55e)' : 'linear-gradient(90deg,#2563eb,#6366f1)'
          }} />
        </div>
      </div>
      <div className="space-y-1.5">
        {UPDATE_STEPS.map((step, i) => {
          const isDone = i < stepIndex || done
          const isActive = i === stepIndex && !done
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isDone ? 'bg-green-50 border-green-100' : isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 opacity-40'}`}>
              {isDone ? <CheckCircle2 size={14} className="text-green-500 shrink-0" /> : isActive ? <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />}
              <span className={`text-xs font-medium ${isDone ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-gray-400'}`}>{step.label}</span>
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-gray-400">Ricarica automatica al completamento</p>
    </div>
  )
}

function UpdateTab({ setUpdating }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const loadStatus = async (attempt = 1) => {
    setLoading(true); setError('')
    try {
      const res = await api.get('/update/status')
      setStatus(res.data)
    } catch (err) {
      const status = err.response?.status
      // Retry automatico una volta su 502/503 (backend in restart)
      if ((status === 502 || status === 503) && attempt === 1) {
        setTimeout(() => loadStatus(2), 3000)
        setError('Backend in avvio, riprovo tra 3 secondi...')
        return
      }
      if (status === 502 || status === 503) {
        setError('Il backend non risponde (502). Riprova tra qualche secondo.')
      } else if (status === 403) {
        setError('Permessi insufficienti per verificare gli aggiornamenti.')
      } else if (!navigator.onLine) {
        setError('Nessuna connessione internet.')
      } else {
        setError('Impossibile verificare aggiornamenti: ' + (err.response?.data?.error || err.message))
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadStatus() }, [])

  const handleUpdate = async () => {
    if (!backupConfirmed) return
    try {
      await api.post('/update/run')
      setStarted(true)
      setConfirming(false)
      if (typeof window !== 'undefined') window.__mhStartVersion = status?.current?.version
      if (setUpdating) setUpdating(true)
    } catch (err) {
      setError('Errore: ' + (err.response?.data?.error || err.message))
    }
  }

  if (started) {
    // Il progresso e' mostrato dal modal globale (vedi isUpdating in fondo al file);
    // qui non renderizziamo nulla per evitare il doppione "a specchio" dietro al modal
    return null
  }

  return (
    <div className="space-y-6">
      {/* Stato corrente */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Verifica aggiornamenti...
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle size={18} /> {error}
          </div>
        ) : status ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Versione installata</p>
                <p className="text-xs text-gray-500 font-mono">{status.current?.version} — {status.currentCommit}</p>
              </div>
              {status.hasUpdate ? (
                <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                  {status.targetVersion ? `v${status.current?.version} ? v${status.targetVersion}` : `${status.commitsBehind} aggiornamenti`}
                </span>
              ) : (
                <span className="text-xs font-semibold px-3 py-1 bg-green-50 text-green-700 rounded-full flex items-center gap-1">
                  <Check size={12} /> Aggiornato
                </span>
              )}
            </div>

            {status.hasUpdate && status.latestCommits?.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Novità</p>
                {status.latestCommits.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-gray-400 shrink-0">{c.hash}</span>
                    <span className="text-gray-600">{c.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <button onClick={loadStatus} disabled={loading}
          className="mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Verifica aggiornamenti
        </button>
      </div>

      {/* Bottone aggiorna */}
      {status?.hasUpdate && !confirming && (
        <button onClick={() => setConfirming(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">
          <ArrowDownCircle size={16} />
          {status.targetVersion ? `Aggiorna alla v${status.targetVersion}` : 'Aggiorna ora'}
        </button>
      )}

      {/* Conferma */}
      {confirming && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <p className="font-semibold text-amber-800">Attenzione — il server si riavvierà</p>
          </div>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>L'aggiornamento dura circa 2-3 minuti</li>
            <li>Il servizio sarà temporaneamente non disponibile</li>
            <li>Assicurati di aver fatto un backup recente</li>
          </ul>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={backupConfirmed} onChange={e => setBackupConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-amber-300" />
            <span className="text-sm font-medium text-amber-800">Ho eseguito un backup recente</span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleUpdate} disabled={!backupConfirmed}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40">
              <ArrowDownCircle size={14} /> Conferma aggiornamento
            </button>
            <button onClick={() => { setConfirming(false); setBackupConfirmed(false) }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


﻿function OAuthWizardTab() {
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [provider, setProvider] = useState('microsoft')
  const [msForm, setMsForm] = useState({ client_id: '', client_secret: '', tenant_id: '' })
  const [gForm, setGForm] = useState({ client_id: '', client_secret: '' })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [mailboxes, setMailboxes] = useState([])
  const [autoProvision, setAutoProvision] = useState(false)
  const [savingAuto, setSavingAuto] = useState(false)

  const loadConfig = () => {
    setLoadingConfig(true)
    api.get('/oauth/app-config').then(res => {
      setConfig(res.data)
      setMsForm({
        client_id: res.data.microsoft?.client_id || '',
        client_secret: res.data.microsoft?.client_secret_masked || '',
        tenant_id: res.data.microsoft?.tenant_id || '',
      })
      setGForm({
        client_id: res.data.google?.client_id || '',
        client_secret: res.data.google?.client_secret_masked || '',
      })
    }).catch(() => {}).finally(() => setLoadingConfig(false))
  }

  const loadMailboxes = () => {
    api.get('/oauth/mailboxes-status').then(res => setMailboxes(res.data || [])).catch(() => {})
  }

  const loadSsoSettings = () => {
    api.get('/oauth/sso-settings').then(res => setAutoProvision(!!res.data?.auto_provision)).catch(() => {})
  }

  useEffect(() => {
    loadConfig()
    loadMailboxes()
    loadSsoSettings()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const form = provider === 'microsoft' ? msForm : gForm
      const payload = {
        provider,
        client_id: form.client_id,
        client_secret: form.client_secret,
        ...(provider === 'microsoft' ? { tenant_id: msForm.tenant_id } : {}),
      }
      const res = await api.post('/oauth/app-config', payload)
      setSaveMsg(res.data?.message || 'Salvato con successo.')
      loadConfig()
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Errore durante il salvataggio.')
    } finally {
      setSaving(false)
    }
  }

  const testConnectivity = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/oauth/check-connectivity/${provider}`)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || 'Errore di connessione' })
    } finally {
      setTesting(false)
    }
  }

  const toggleAutoProvision = async () => {
    setSavingAuto(true)
    try {
      const next = !autoProvision
      await api.post('/oauth/sso-settings', { auto_provision: next })
      setAutoProvision(next)
    } catch {}
    setSavingAuto(false)
  }

  const StatusBadge = ({ ok, label }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
      ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
    }`}>
      {ok ? <Wifi size={12} /> : <WifiOff size={12} />}
      {label}
    </span>
  )

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"

  if (loadingConfig) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={18}/> Caricamento configurazione...</div>
  }

  return (
    <div className="space-y-6">
      {/* Selettore provider */}
      <div className="flex gap-2">
        <button onClick={() => { setProvider('microsoft'); setTestResult(null) }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
            provider === 'microsoft' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}>
          <Cloud size={16} /> Microsoft 365
          {config?.microsoft?.configured && <CheckCircle2 size={14} className="text-emerald-500" />}
        </button>
        <button onClick={() => { setProvider('google'); setTestResult(null) }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
            provider === 'google' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}>
          <Cloud size={16} /> Google Workspace
          {config?.google?.configured && <CheckCircle2 size={14} className="text-emerald-500" />}
        </button>
      </div>

      {provider === 'microsoft' && (
        <div className="space-y-5">
          {/* Step 1 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">1</span>
              Registra l'app su Azure Portal
            </div>
            <p className="text-sm text-gray-500 pl-8">
              Vai su <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Azure Portal <ExternalLink size={12}/></a> ??? Microsoft Entra ID ??? Registrazioni app ??? Nuova registrazione.
            </p>
            <div className="pl-8 text-sm text-gray-500">
              Imposta come Redirect URI (Web):
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs break-all">
                {config?.redirect_uri_microsoft || 'Configura prima l\'URL pubblico applicazione (tab SMTP)'}
              </div>
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs break-all">
                {config?.redirect_uri_microsoft ? config.redirect_uri_microsoft.replace('/oauth/microsoft/callback', '/auth/oauth/microsoft/callback') : ''}
              </div>
              <p className="text-xs text-gray-400 mt-1">Il primo URI serve per la sincronizzazione caselle, il secondo per il login SSO.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">2</span>
              Inserisci le credenziali
            </div>
            <div className="grid grid-cols-2 gap-3 pl-8">
              <Field label="Application (client) ID">
                <input className={inputCls} value={msForm.client_id}
                  onChange={e => setMsForm({ ...msForm, client_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
              </Field>
              <Field label="Directory (tenant) ID">
                <input className={inputCls} value={msForm.tenant_id}
                  onChange={e => setMsForm({ ...msForm, tenant_id: e.target.value })} placeholder="common oppure ID tenant" />
              </Field>
            </div>
            <div className="pl-8">
              <Field label="Client secret (Valore)">
                <input type="password" className={inputCls} value={msForm.client_secret}
                  onChange={e => setMsForm({ ...msForm, client_secret: e.target.value })} placeholder="Inserisci il valore del secret" />
              </Field>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">3</span>
              Permessi API richiesti
            </div>
            <ul className="pl-8 text-sm text-gray-500 space-y-1 list-disc list-inside">
              <li><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">User.Read</code> (delega) ??? profilo utente per login SSO</li>
              <li><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">Mail.Read</code> (delega o applicazione) ??? lettura email per sincronizzazione</li>
              <li><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">offline_access</code> ??? refresh token</li>
            </ul>
          </div>

          {/* Step 4 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">4</span>
              Salva e verifica
            </div>
            <div className="pl-8 flex flex-wrap items-center gap-3">
              <button onClick={saveConfig} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salva credenziali
              </button>
              <button onClick={testConnectivity} disabled={testing}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60">
                {testing ? <Loader2 size={14} className="animate-spin"/> : <Wifi size={14}/>} Test connettivit??
              </button>
              {config?.microsoft?.configured && (
                <StatusBadge ok={true} label="Configurato" />
              )}
            </div>
            {saveMsg && <p className="pl-8 text-sm text-gray-500">{saveMsg}</p>}
            {testResult && (
              <div className={`ml-8 text-sm px-3 py-2 rounded-lg border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.ok ? `Connessione riuscita (${testResult.ms || '?'} ms)` : (testResult.error || 'Connessione fallita')}
              </div>
            )}
          </div>
        </div>
      )}

      {provider === 'google' && (
        <div className="space-y-5">
          {/* Step 1 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">1</span>
              Crea le credenziali su Google Cloud Console
            </div>
            <p className="text-sm text-gray-500 pl-8">
              Vai su <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Google Cloud Console <ExternalLink size={12}/></a> ??? Credenziali ??? Crea credenziali ??? ID client OAuth (tipo Applicazione web).
            </p>
            <div className="pl-8 text-sm text-gray-500">
              Aggiungi questi URI di reindirizzamento autorizzati:
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs break-all">
                {config?.redirect_uri_google || 'Configura prima l\'URL pubblico applicazione (tab SMTP)'}
              </div>
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs break-all">
                {config?.redirect_uri_google ? config.redirect_uri_google.replace('/oauth/google/callback', '/auth/oauth/google/callback') : ''}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">2</span>
              Inserisci le credenziali
            </div>
            <div className="pl-8 space-y-3">
              <Field label="Client ID">
                <input className={inputCls} value={gForm.client_id}
                  onChange={e => setGForm({ ...gForm, client_id: e.target.value })} placeholder="xxxxxxxx.apps.googleusercontent.com" />
              </Field>
              <Field label="Client secret">
                <input type="password" className={inputCls} value={gForm.client_secret}
                  onChange={e => setGForm({ ...gForm, client_secret: e.target.value })} placeholder="Inserisci il client secret" />
              </Field>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">3</span>
              Salva e verifica
            </div>
            <div className="pl-8 flex flex-wrap items-center gap-3">
              <button onClick={saveConfig} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salva credenziali
              </button>
              <button onClick={testConnectivity} disabled={testing}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60">
                {testing ? <Loader2 size={14} className="animate-spin"/> : <Wifi size={14}/>} Test connettivit??
              </button>
              {config?.google?.configured && (
                <StatusBadge ok={true} label="Configurato" />
              )}
            </div>
            {saveMsg && <p className="pl-8 text-sm text-gray-500">{saveMsg}</p>}
            {testResult && (
              <div className={`ml-8 text-sm px-3 py-2 rounded-lg border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.ok ? `Connessione riuscita (${testResult.ms || '?'} ms)` : (testResult.error || 'Connessione fallita')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SSO auto-provisioning */}
      <div className="p-4 border border-gray-200 rounded-xl flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Crea automaticamente gli utenti al primo accesso SSO</div>
          <p className="text-sm text-gray-500">
            Se attivo, un utente che effettua il login con Microsoft 365 o Google e non esiste ancora in MailHaven viene creato automaticamente con ruolo "Utente".
            Se disattivo, l'utente deve essere creato manualmente da un amministratore prima di poter accedere via SSO.
          </p>
        </div>
        <button onClick={toggleAutoProvision} disabled={savingAuto}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoProvision ? 'bg-blue-600' : 'bg-gray-300'} disabled:opacity-60`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoProvision ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Status caselle OAuth */}
      {mailboxes.length > 0 && (
        <div className="p-4 border border-gray-200 rounded-xl space-y-3">
          <div className="text-sm font-semibold text-gray-700">Caselle collegate via OAuth</div>
          <div className="space-y-2">
            {mailboxes.map(mb => (
              <div key={mb.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-sm text-gray-700">{mb.email_address || mb.email}</div>
                <StatusBadge ok={mb.status === 'ok' || mb.connected} label={mb.status === 'ok' || mb.connected ? 'Connesso' : 'Da riautorizzare'} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}



export default function Settings() {
  const { user } = useAuth()
  const [isUpdating, setIsUpdating] = React.useState(false)
  const [activeTab, setActiveTab] = useState('sync')
  const [searchParams] = useSearchParams()
  useEffect(() => { const t = searchParams.get('tab'); if (t) setActiveTab(t) }, [searchParams])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('ok')

  const [syncInterval, setSyncInterval] = useState('15')
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [mailboxes, setMailboxes] = useState([])
  const [policies, setPolicies] = useState({})
  const [savingPolicy, setSavingPolicy] = useState(null)
  const [avUpdateSchedule, setAvUpdateSchedule] = useState('24')
  const [avUpdateTime, setAvUpdateTime] = useState('02:00')
  const [avScanOnOpen, setAvScanOnOpen] = useState(true)
  const [avNotifyOnInfection, setAvNotifyOnInfection] = useState(false)
  const [updatingAv, setUpdatingAv] = useState(false)
  const [appUrl, setAppUrl] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [pluginTokens, setPluginTokens] = useState([])
  const [loadingTokens, setLoadingTokens] = useState(false)

  useEffect(() => {
    if (activeTab === 'plugin') loadPluginTokens()
  }, [activeTab])

  const loadPluginTokens = async () => {
    setLoadingTokens(true)
    try { const res = await api.get('/plugin/tokens'); setPluginTokens(res.data || []) }
    catch {} finally { setLoadingTokens(false) }
  }

  const generateToken = async (clientType) => {
    try {
      const res = await api.post('/plugin/tokens', {
        name: clientType === 'outlook' ? 'Outlook Add-in' : 'Thunderbird Extension',
        client_type: clientType, expires_days: 365
      })
      setPluginTokens(prev => [res.data, ...prev])
    } catch { showMsg('Errore generazione token', 'error') }
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
      if (s.app_url) setAppUrl(s.app_url)
      if (s.smtp_host) setSmtpHost(s.smtp_host)
      if (s.smtp_port) setSmtpPort(s.smtp_port)
      if (s.smtp_secure !== undefined) setSmtpSecure(s.smtp_secure === 'true')
      if (s.smtp_user) setSmtpUser(s.smtp_user)
    }).catch(() => {})
    api.get('/admin/mailboxes').then(res => {
      setMailboxes(res.data || [])
      res.data?.forEach(m => {
        api.get('/admin/mailboxes/' + m.id + '/policy').then(r => {
          setPolicies(p => ({ ...p, [m.id]: r.data || {} }))
        }).catch(() => {})
      })
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
        sync_interval_minutes: syncInterval, sync_enabled: String(syncEnabled),
        av_update_hours: avUpdateSchedule, av_update_time: avUpdateTime,
        av_scan_on_open: String(avScanOnOpen), av_notify_on_infection: String(avNotifyOnInfection),
        app_url: appUrl.trim(),
        oauth_redirect_base_url: appUrl.trim(),
        smtp_host: smtpHost, smtp_port: smtpPort, smtp_secure: String(smtpSecure), smtp_user: smtpUser,
        ...(smtpPass ? { smtp_pass: smtpPass } : {}),
      })
      api.post('/admin/av/restart-scheduler').catch(() => {})
      showMsg('Impostazioni salvate!')
    } catch { showMsg('Errore durante il salvataggio', 'error') }
    finally { setSaving(false) }
  }

  const updateAvNow = async () => {
    setUpdatingAv(true)
    try { await api.post('/admin/av/update'); showMsg('Database ClamAV aggiornato!') }
    catch { showMsg('Errore aggiornamento AV', 'error') }
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
    <>
    {isUpdating && (
      <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(15,23,42,0.7)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'white',borderRadius:'1rem',padding:'2rem',minWidth:'480px',maxWidth:'90vw',boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)'}}>
          <UpdateProgress startVersion={window.__mhStartVersion} onComplete={() => {}} />
        </div>
      </div>
    )}
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon size={20} className="text-gray-500" /> Impostazioni
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Configurazione del sistema MailHaven</p>
      </div>


      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {activeTab === 'sync' && (
          <div className="space-y-6">
            <Toggle checked={syncEnabled} onChange={setSyncEnabled}
              label="Sincronizzazione automatica"
              description="Abilita il crawler IMAP periodico su tutte le caselle attive" />
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

            {mailboxes.length > 0 && (
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Policy di archiviazione</h3>
                <p className="text-xs text-gray-500 mb-4">Configura per ogni casella cosa archiviare e quando eliminare dall'IMAP.</p>
                <div className="space-y-4">
                  {mailboxes.map(m => {
                    const p = policies[m.id] || {}
                    const filter = p.filter || {}
                    const del = p.delete || {}
                    const save = async (np) => {
                      setSavingPolicy(m.id)
                      await api.put('/admin/mailboxes/' + m.id + '/policy', np).catch(() => {})
                      setPolicies(prev => ({ ...prev, [m.id]: np }))
                      setSavingPolicy(null)
                    }
                    const saveFilter = (fk, fv) => save({ ...p, filter: { ...filter, [fk]: fv } })
                    const saveDel = (dk, dv) => save({ ...p, delete: { ...del, [dk]: dv } })

                    return (
                      <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Header casella */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{m.display_name || m.email}</p>
                            <p className="text-xs text-gray-400">{m.email}</p>
                          </div>
                        </div>

                        <div className="p-4 space-y-5">
                          {/* ── SEZIONE FILTRO ── */}
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Filtro — Cosa archiviare</p>
                            <div className="space-y-3">
                              {/* Includi non letti */}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox"
                                  checked={filter.include_unread !== false}
                                  onChange={e => saveFilter('include_unread', e.target.checked)}
                                  className="w-4 h-4 rounded text-blue-600" />
                                <span className="text-sm text-gray-700">Archivia anche messaggi non letti</span>
                              </label>

                              {/* Data da */}
                              <div className="space-y-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox"
                                    checked={!!filter.date_from_enabled}
                                    onChange={e => saveFilter('date_from_enabled', e.target.checked)}
                                    className="w-4 h-4 rounded text-blue-600" />
                                  <span className="text-sm text-gray-700">Archivia solo messaggi più recenti di</span>
                                </label>
                                {filter.date_from_enabled && (
                                  <div className="ml-6 flex items-center gap-2 flex-wrap">
                                    <select value={filter.date_from_type || 'days'}
                                      onChange={e => saveFilter('date_from_type', e.target.value)}
                                      className={selectClass + ' w-28'}>
                                      <option value="days">Intervallo</option>
                                      <option value="date">Data fissa</option>
                                    </select>
                                    {filter.date_from_type === 'date' ? (
                                      <input type="date" value={filter.date_from || ''}
                                        onChange={e => saveFilter('date_from', e.target.value)}
                                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <input type="number" min="1" max="3650" value={filter.date_from_days || 30}
                                          onChange={e => saveFilter('date_from_days', parseInt(e.target.value))}
                                          className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        <span className="text-xs text-gray-500">giorni fa</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Data a */}
                              <div className="space-y-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox"
                                    checked={!!filter.date_to_enabled}
                                    onChange={e => saveFilter('date_to_enabled', e.target.checked)}
                                    className="w-4 h-4 rounded text-blue-600" />
                                  <span className="text-sm text-gray-700">Archivia solo messaggi antecedenti a</span>
                                </label>
                                {filter.date_to_enabled && (
                                  <div className="ml-6 flex items-center gap-2 flex-wrap">
                                    <select value={filter.date_to_type || 'days'}
                                      onChange={e => saveFilter('date_to_type', e.target.value)}
                                      className={selectClass + ' w-28'}>
                                      <option value="days">Intervallo</option>
                                      <option value="date">Data fissa</option>
                                    </select>
                                    {filter.date_to_type === 'date' ? (
                                      <input type="date" value={filter.date_to || ''}
                                        onChange={e => saveFilter('date_to', e.target.value)}
                                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <input type="number" min="1" max="3650" value={filter.date_to_days || 90}
                                          onChange={e => saveFilter('date_to_days', parseInt(e.target.value))}
                                          className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        <span className="text-xs text-gray-500">giorni fa</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ── SEZIONE ELIMINA ── */}
                          <div className="border-t border-gray-100 pt-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Elimina — Quando rimuovere dall'IMAP</p>
                            <div className="space-y-3">
                              <select value={del.mode || 'never'}
                                onChange={e => saveDel('mode', e.target.value)}
                                className={selectClass}>
                                <option value="never">Mai — mantieni sull'IMAP</option>
                                <option value="immediately">Immediatamente dopo l'archiviazione</option>
                                <option value="after_days">Almeno X giorni dopo l'archiviazione</option>
                                <option value="older_than">Se il messaggio è antecedente a X giorni</option>
                              </select>

                              {(del.mode === 'after_days' || del.mode === 'older_than') && (
                                <div className="flex items-center gap-2 ml-1">
                                  <input type="number" min="1" max="3650"
                                    value={del.days || 30}
                                    onChange={e => saveDel('days', parseInt(e.target.value))}
                                    className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  <span className="text-xs text-gray-500">giorni</span>
                                </div>
                              )}

                              {del.mode !== 'never' && (
                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                  <input type="checkbox"
                                    checked={!!del.include_flagged}
                                    onChange={e => saveDel('include_flagged', e.target.checked)}
                                    className="w-4 h-4 rounded text-blue-600" />
                                  <span className="text-sm text-gray-700">Elimina anche i messaggi contrassegnati (flag)</span>
                                </label>
                              )}
                            </div>
                          </div>

                          {savingPolicy === m.id && (
                            <p className="text-xs text-blue-500 flex items-center gap-1">
                              <Loader2 size={11} className="animate-spin" /> Salvataggio...
                            </p>
                          )}

                          {/* Applica policy alle email già archiviate */}
                          {del.mode && del.mode !== 'never' && (
                            <div className="border-t border-gray-100 pt-3 mt-1">
                              <button
                                onClick={async () => {
                                  if (!confirm(`Applicare la policy alle email già archiviate di ${m.email}? Le email che rientrano nei criteri verranno eliminate dall'IMAP.`)) return;
                                  try {
                                    const res = await api.post(`/emails/apply-policy/${m.id}`);
                                    alert(res.data.message);
                                  } catch (e) {
                                    alert(e.response?.data?.error || 'Errore');
                                  }
                                }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors font-medium">
                                ⚡ Applica policy alle email già archiviate
                              </button>
                              <p className="text-[10px] text-gray-400 mt-1">Elimina dall'IMAP le email già in archivio che rientrano nei criteri configurati.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'av' && (
          <div className="space-y-6">
            <Toggle checked={avScanOnOpen} onChange={setAvScanOnOpen}
              label="Scansione automatica all'apertura"
              description="Scansiona gli allegati quando si apre un'email" />
            <Toggle checked={avNotifyOnInfection} onChange={setAvNotifyOnInfection}
              label="Notifica via email in caso di virus"
              description="Invia una notifica all'amministratore se viene rilevato un virus" />
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
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={updateAvNow} disabled={updatingAv}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-blue-500 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-60 transition-colors">
                {updatingAv ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {updatingAv ? 'Aggiornamento...' : 'Aggiorna database ora'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'oauth' && <OAuthWizardTab />}
        {activeTab === 'security' && <SecurityTab user={user} />}
        {activeTab === 'update' && <UpdateTab setUpdating={setIsUpdating} />}

        {activeTab === 'plugin' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Plugin per client email</h3>
              <p className="text-xs text-gray-500 mb-4">Installa il plugin nel tuo client email per accedere all'archivio MailHaven direttamente da Outlook o Thunderbird.</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="flex flex-col gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 transition-colors text-center">
                  <img src="/outlook-icon.png" className="w-12 h-12 object-contain mx-auto" alt="Outlook" />
                  <span className="text-sm font-semibold text-gray-800">Outlook Add-in</span>
                  <span className="text-xs text-gray-500 mb-1">Installa via URL manifest in Outlook</span>
                  <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                    <span className="text-xs font-mono text-gray-600 truncate flex-1">{window.location.origin}/api/plugin/manifest/outlook</span>
                    <button onClick={() => { navigator.clipboard.writeText(window.location.origin+'/api/plugin/manifest/outlook'); showMsg('URL copiato!') }}
                      className="text-blue-600 hover:text-blue-700 shrink-0 text-xs font-semibold px-1">Copia</button>
                  </div>
                  <a href={`${window.location.origin}/api/plugin/manifest/outlook`} download="mailhaven-manifest.xml"
                    className="text-xs text-gray-400 hover:text-gray-600 underline">oppure scarica XML</a>
                </div>
                <a href={`${window.location.origin}/api/plugin/download/thunderbird`}
                  download="mailhaven-thunderbird.json"
                  className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
                  <img src="/thunderbird-icon.png" className="w-12 h-12 object-contain" alt="Thunderbird" />
                  <span className="text-sm font-semibold text-gray-800">Thunderbird</span>
                  <span className="text-xs text-gray-500">Scarica estensione</span>
                </a>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-6">
                <p className="font-semibold mb-1">Come installare:</p>
                <p><b>Outlook:</b> File → Gestisci componenti aggiuntivi → Carica manifest XML</p>
                <p className="mt-1"><b>Thunderbird:</b> Strumenti → Componenti aggiuntivi → Installa da file</p>
              </div>
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
                {loadingTokens ? (
                  <div className="text-center py-4 text-gray-400 text-sm">Caricamento...</div>
                ) : pluginTokens.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">Nessun token generato.</div>
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

        {activeTab === 'smtp' && (
          <div className="space-y-5">
            {/* URL Applicazione */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <Field label="URL pubblico applicazione">
                <input type="url" value={appUrl} onChange={e => setAppUrl(e.target.value)}
                  placeholder="https://mailhaven.tuodominio.it" className={inputClass} />
              </Field>
              <p className="text-xs text-gray-500">Necessario per OAuth Microsoft 365 / Google e per accesso esterno. Lascia vuoto per installazioni solo interne.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Server SMTP">
                  <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                    placeholder="mail.tuodominio.it" className={inputClass} />
                </Field>
              </div>
              <Field label="Porta">
                <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Username">
              <input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                placeholder="notifiche@tuodominio.it" className={inputClass} />
            </Field>
            <Field label="Password">
              <input type="password" defaultValue={smtpPass} onChange={e => setSmtpPass(e.target.value)}
                placeholder="••••••••" className={inputClass} autoComplete="new-password" />
            </Field>
            <Toggle checked={smtpSecure} onChange={setSmtpSecure} label="SSL/TLS" description="Usa connessione sicura (porta 465)" />
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

      <div className="flex items-center gap-4 mt-6">
        {activeTab !== 'update' && (
        <button onClick={saveSettings} disabled={saving || activeTab === 'security' || activeTab === 'oauth'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60 bg-blue-600 hover:bg-blue-700 transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>
        )}
        {msg && (
          <span className={`flex items-center gap-1.5 text-sm font-medium ${msgType === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msgType === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
            {msg}
          </span>
        )}
      </div>
    </div>
    </>
  )
}
