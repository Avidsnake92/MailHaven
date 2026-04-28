import { useState, useEffect } from 'react'
import api from '../services/api'
import { Shield, Save, Loader2, RefreshCw, Check, AlertCircle, Mail, Database, Settings as SettingsIcon, Puzzle, Download, Copy, Trash2, Plus } from 'lucide-react'

const TABS = [
  { id: 'sync',  label: 'Sincronizzazione', icon: Database },
  { id: 'av',    label: 'Antivirus',         icon: Shield   },
  { id: 'smtp',  label: 'Notifiche Email',   icon: Mail     },
  { id: 'plugin', label: 'Plugin Client',    icon: Puzzle   },
]

export default function Settings() {
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
    <div className="p-6 max-w-4xl mx-auto min-h-full">
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
