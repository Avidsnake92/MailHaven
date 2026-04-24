import { useState, useEffect } from 'react'
import api from '../services/api'
import { useBranding } from '../context/BrandingContext'
import { 
  HardDrive, Upload, Download, CheckCircle, XCircle, 
  Loader2, RefreshCw, Clock, Database, Server,
  ChevronDown, ChevronUp, Eye, EyeOff, Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const PROVIDERS = [
  { id: 'custom', name: 'Custom S3', endpoint: '' },
  { id: 'aws', name: 'AWS S3', endpoint: 'https://s3.amazonaws.com' },
  { id: 'wasabi', name: 'Wasabi', endpoint: 'https://s3.wasabisys.com' },
  { id: 'backblaze', name: 'Backblaze B2', endpoint: 'https://s3.us-west-004.backblazeb2.com' },
  { id: 'minio', name: 'MinIO', endpoint: 'http://localhost:9000' },
  { id: 'seaweedfs', name: 'SeaweedFS', endpoint: 'http://localhost:8333' },
  { id: 'cloudflare', name: 'Cloudflare R2', endpoint: '' },
  { id: 'digitalocean', name: 'DigitalOcean Spaces', endpoint: '' },
]

const DAYS = [
  { id: '*', label: 'Ogni giorno' },
  { id: '1', label: 'Lunedì' },
  { id: '2', label: 'Martedì' },
  { id: '3', label: 'Mercoledì' },
  { id: '4', label: 'Giovedì' },
  { id: '5', label: 'Venerdì' },
  { id: '6', label: 'Sabato' },
  { id: '0', label: 'Domenica' },
]

const MONTHS = [
  { id: '*', label: 'Ogni mese' },
  { id: '1', label: '1° del mese' },
  { id: '15', label: '15° del mese' },
]

const buildCron = (hour, minute, dayOfWeek, dayOfMonth) => {
  if (dayOfMonth !== '*') return `${minute} ${hour} ${dayOfMonth} * *`
  return `${minute} ${hour} * * ${dayOfWeek}`
}

const parseCron = (cron) => {
  if (!cron || cron === 'manual') return { hour: '2', minute: '0', dayOfWeek: '*', dayOfMonth: '*' }
  const parts = cron.split(' ')
  if (parts.length !== 5) return { hour: '2', minute: '0', dayOfWeek: '*', dayOfMonth: '*' }
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    dayOfWeek: parts[4],
  }
}

const formatSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (d) => {
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: it }) } catch { return d }
}

// Schedule picker component
function SchedulePicker({ config, setConfig }) {
  const [enabled, setEnabled] = useState(config.schedule && config.schedule !== 'manual')
  const parsed = parseCron(config.schedule)
  const [hour, setHour] = useState(parsed.hour)
  const [minute, setMinute] = useState(parsed.minute)
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek)
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth)

  const update = (h, m, dow, dom) => {
    if (!enabled) return
    setConfig(c => ({ ...c, schedule: buildCron(h, m, dow, dom) }))
  }

  const toggle = (val) => {
    setEnabled(val)
    setConfig(c => ({ ...c, schedule: val ? buildCron(hour, minute, dayOfWeek, dayOfMonth) : 'manual' }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-gray-600">Backup automatico</label>
        <button onClick={() => toggle(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
        {enabled && <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">{config.schedule}</span>}
      </div>

      {enabled && (
        <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ora</label>
            <select value={hour} onChange={e => { setHour(e.target.value); update(e.target.value, minute, dayOfWeek, dayOfMonth) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              {Array.from({length: 24}, (_, i) => i).map(h => (
                <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Minuto</label>
            <select value={minute} onChange={e => { setMinute(e.target.value); update(hour, e.target.value, dayOfWeek, dayOfMonth) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              {['0','5','10','15','20','25','30','35','40','45','50','55'].map(m => (
                <option key={m} value={m}>:{m.padStart(2,'0')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Giorno settimana</label>
            <select value={dayOfWeek} onChange={e => { setDayOfWeek(e.target.value); update(hour, minute, e.target.value, dayOfMonth) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              {DAYS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Giorno mese</label>
            <select value={dayOfMonth} onChange={e => { setDayOfMonth(e.target.value); update(hour, minute, dayOfWeek, e.target.value) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              {MONTHS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// Retention picker component
function RetentionPicker({ config, setConfig }) {
  const [mode, setMode] = useState(config.retention_versions ? 'versions' : 'days')

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-600">Retention policy</label>
      <div className="flex gap-2">
        <button onClick={() => { setMode('days'); setConfig(c => ({ ...c, retention_versions: null })) }}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${mode === 'days' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
          Per giorni
        </button>
        <button onClick={() => { setMode('versions'); setConfig(c => ({ ...c, retention_days: null })) }}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${mode === 'versions' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
          Per versioni
        </button>
      </div>

      {mode === 'days' && (
        <div className="flex items-center gap-3">
          <input type="number" min="1" max="365"
            value={config.retention_days || 30}
            onChange={e => setConfig(c => ({ ...c, retention_days: parseInt(e.target.value) }))}
            className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <span className="text-sm text-gray-600">giorni</span>
          <div className="flex gap-2 ml-2">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setConfig(c => ({ ...c, retention_days: d }))}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${config.retention_days === d ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {d}g
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'versions' && (
        <div className="flex items-center gap-3">
          <input type="number" min="1" max="100"
            value={config.retention_versions || 10}
            onChange={e => setConfig(c => ({ ...c, retention_versions: parseInt(e.target.value) }))}
            className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <span className="text-sm text-gray-600">versioni da mantenere</span>
          <div className="flex gap-2 ml-2">
            {[5, 10, 20, 30].map(v => (
              <button key={v} onClick={() => setConfig(c => ({ ...c, retention_versions: v }))}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${config.retention_versions === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">I backup più vecchi vengono eliminati automaticamente dopo il backup</p>
    </div>
  )
}

export default function Backup() {
  const { branding } = useBranding()
  const [activeTab, setActiveTab] = useState('s3')
  const [s3Config, setS3Config] = useState({ 
    endpoint: '', region: 'us-east-1', bucket: '', access_key: '', secret_key: '', 
    prefix: 'mailvault-backup', force_path_style: true, schedule: 'manual', enabled: false,
    retention_days: 30, retention_versions: null
  })
  const [sftpConfig, setSftpConfig] = useState({ 
    sftp_host: '', sftp_port: 22, sftp_username: '', sftp_password: '', 
    sftp_remote_path: '/backups', schedule: 'manual', enabled: false,
    retention_days: 30, retention_versions: null
  })
  const [showSecret, setShowSecret] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('custom')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [backupRunning, setBackupRunning] = useState(false)
  const [backupResult, setBackupResult] = useState(null)
  const [backups, setBackups] = useState([])
  const [logs, setLogs] = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [restoreResult, setRestoreResult] = useState(null)
  const [showLogs, setShowLogs] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadConfig(); loadLogs() }, [])

  const loadConfig = async () => {
    try {
      const res = await api.get('/backup/config')
      const configs = res.data || []
      const s3 = configs.find(c => c.provider_type === 's3')
      const sftp = configs.find(c => c.provider_type === 'sftp')
      if (s3) setS3Config(c => ({ ...c, ...s3, secret_key: '' }))
      if (sftp) setSftpConfig(c => ({ ...c, ...sftp, sftp_password: '' }))
    } catch {}
  }

  const loadLogs = async () => {
    try { const res = await api.get('/backup/logs'); setLogs(res.data || []) } catch {}
  }

  const currentConfig = activeTab === 's3' ? s3Config : sftpConfig
  const setCurrentConfig = activeTab === 's3' ? setS3Config : setSftpConfig

  const handleProviderChange = (pid) => {
    setSelectedProvider(pid)
    const p = PROVIDERS.find(x => x.id === pid)
    if (p?.endpoint) setS3Config(c => ({ ...c, endpoint: p.endpoint }))
  }

  const handleSave = async () => {
    setSaving(true); setMsg(''); setError('')
    try {
      await api.post('/backup/config', { ...currentConfig, provider_type: activeTab })
      setMsg('Configurazione salvata')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) { setError(err.response?.data?.error || 'Errore salvataggio') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await api.post('/backup/test', { provider_type: activeTab })
      setTestResult({ success: true, message: res.data.message })
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || 'Connessione fallita' })
    } finally { setTesting(false) }
  }

  const handleRunBackup = async () => {
    setBackupRunning(true); setBackupResult(null)
    try {
      const res = await api.post('/backup/run', { provider_type: activeTab })
      setBackupResult({ success: true, key: res.data.key, size: res.data.size })
      loadLogs(); loadBackups()
    } catch (err) {
      setBackupResult({ success: false, error: err.response?.data?.error || 'Backup fallito' })
    } finally { setBackupRunning(false) }
  }

  const loadBackups = async () => {
    setLoadingBackups(true)
    try {
      const res = await api.get(`/backup/list?type=${activeTab}`)
      setBackups(res.data || [])
    } catch (err) { setError('Errore caricamento lista backup') }
    finally { setLoadingBackups(false) }
  }

  const handleRestore = async (key) => {
    if (!window.confirm(`⚠️ Ripristinare il backup "${key.split('/').pop()}"?\n\nQuesta operazione sovrascriverà i file esistenti.`)) return
    setRestoring(key); setRestoreResult(null)
    try {
      const res = await api.post('/backup/restore', { key, provider_type: activeTab })
      setRestoreResult({ success: true, message: res.data.message })
    } catch (err) {
      setRestoreResult({ success: false, error: err.response?.data?.error || 'Restore fallito' })
    } finally { setRestoring(null) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto h-full overflow-y-auto fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Backup</h1>
        <p className="text-sm text-gray-500 mt-0.5">Backup automatico su S3 o NAS via SFTP</p>
      </div>

      {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{msg}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {[['s3', 'S3 / Cloud', Database], ['sftp', 'NAS via SFTP', Server]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setActiveTab(id); setTestResult(null); setBackupResult(null); setBackups([]) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Config panel */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          {activeTab === 's3' ? <Database size={18} className="text-gray-500" /> : <Server size={18} className="text-gray-500" />}
          <h2 className="font-semibold text-gray-900">{activeTab === 's3' ? 'Configurazione S3' : 'Configurazione NAS (SFTP)'}</h2>
        </div>

        <div className="p-6 space-y-5">
          {/* S3 fields */}
          {activeTab === 's3' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map(p => (
                    <button key={p.id} onClick={() => handleProviderChange(p.id)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${selectedProvider === p.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL</label>
                  <input value={s3Config.endpoint || ''} onChange={e => setS3Config(c => ({ ...c, endpoint: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" placeholder="https://s3.amazonaws.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bucket</label>
                  <input value={s3Config.bucket || ''} onChange={e => setS3Config(c => ({ ...c, bucket: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" placeholder="nome-bucket" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
                  <input value={s3Config.region || ''} onChange={e => setS3Config(c => ({ ...c, region: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" placeholder="us-east-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Access Key</label>
                  <input value={s3Config.access_key || ''} onChange={e => setS3Config(c => ({ ...c, access_key: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 font-mono text-xs" placeholder="AKIAIOSFODNN7EXAMPLE" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Secret Key</label>
                  <div className="relative">
                    <input type={showSecret ? 'text' : 'password'} value={s3Config.secret_key || ''}
                      onChange={e => setS3Config(c => ({ ...c, secret_key: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 font-mono text-xs" placeholder="••••••••" />
                    <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">🔒 Cifrata AES-256</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prefisso cartella</label>
                  <input value={s3Config.prefix || 'mailvault-backup'} onChange={e => setS3Config(c => ({ ...c, prefix: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Force Path Style</label>
                <button onClick={() => setS3Config(c => ({ ...c, force_path_style: !c.force_path_style }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s3Config.force_path_style ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s3Config.force_path_style ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-gray-400">Richiesto per MinIO, SeaweedFS e altri self-hosted</span>
              </div>
            </>
          )}

          {/* SFTP fields */}
          {activeTab === 'sftp' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Host NAS / IP</label>
                <input value={sftpConfig.sftp_host || ''} onChange={e => setSftpConfig(c => ({ ...c, sftp_host: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" placeholder="192.168.1.100 o nas.dominio.it" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Porta SSH</label>
                <input type="number" value={sftpConfig.sftp_port || 22} onChange={e => setSftpConfig(c => ({ ...c, sftp_port: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                <input value={sftpConfig.sftp_username || ''} onChange={e => setSftpConfig(c => ({ ...c, sftp_username: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" placeholder="admin" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                <div className="relative">
                  <input type={showSecret ? 'text' : 'password'} value={sftpConfig.sftp_password || ''}
                    onChange={e => setSftpConfig(c => ({ ...c, sftp_password: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2" placeholder="••••••••" />
                  <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">🔒 Cifrata AES-256</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cartella remota</label>
                <input value={sftpConfig.sftp_remote_path || '/backups'} onChange={e => setSftpConfig(c => ({ ...c, sftp_remote_path: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 font-mono text-xs" placeholder="/volume1/backups/mailvault" />
                <p className="text-xs text-gray-400 mt-1">Synology: /volume1/cartella — QNAP: /share/cartella</p>
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="border-t border-gray-100 pt-5">
            <SchedulePicker config={currentConfig} setConfig={setCurrentConfig} />
          </div>

          {/* Retention */}
          <div className="border-t border-gray-100 pt-5">
            <RetentionPicker config={currentConfig} setConfig={setCurrentConfig} />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult.message}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: branding.primary_color || '#2563eb' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Salva
            </button>
            <button onClick={handleTest} disabled={testing}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Test connessione
            </button>
          </div>
        </div>
      </div>

      {/* Backup manuale */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <HardDrive size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Backup manuale</h2>
        </div>
        <div className="p-6">
          {backupResult && (
            <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-lg mb-4 ${backupResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {backupResult.success ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
              <div>
                {backupResult.success
                  ? <><p className="font-medium">Backup completato</p><p className="text-xs mt-0.5">{backupResult.key?.split('/').pop()} · {formatSize(backupResult.size)}</p></>
                  : <p>{backupResult.error}</p>}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={handleRunBackup} disabled={backupRunning}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: branding.primary_color || '#2563eb' }}>
              {backupRunning ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {backupRunning ? 'Backup in corso...' : 'Avvia backup ora'}
            </button>
            <button onClick={loadBackups} disabled={loadingBackups}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {loadingBackups ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Carica lista backup
            </button>
          </div>
        </div>
      </div>

      {/* Lista backup */}
      {backups.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <Download size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Backup disponibili ({backups.length})</h2>
          </div>
          {restoreResult && (
            <div className={`mx-6 mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${restoreResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {restoreResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {restoreResult.success ? restoreResult.message : restoreResult.error}
            </div>
          )}
          <div className="divide-y divide-gray-50">
            {backups.map(backup => (
              <div key={backup.key} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">{backup.key?.split('/').pop() || backup.filename}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(backup.date)} · {formatSize(backup.size)}</p>
                </div>
                <button onClick={() => handleRestore(backup.key)} disabled={!!restoring}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                  {restoring === backup.key ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Ripristina
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => setShowLogs(!showLogs)} className="flex items-center justify-between w-full px-6 py-4 text-left">
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Log backup ({logs.length})</h2>
          </div>
          {showLogs ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {showLogs && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nessun backup eseguito</p>
            ) : logs.map(log => {
              const details = typeof log.details === 'string' ? (() => { try { return JSON.parse(log.details) } catch { return {} } })() : log.details || {}
              return (
                <div key={log.id} className="flex items-center gap-4 px-6 py-3">
                  {log.status === 'success' ? <CheckCircle size={14} className="text-green-500 shrink-0" /> : <XCircle size={14} className="text-red-500 shrink-0" />}
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">{formatDate(log.created_at)} · {log.type?.toUpperCase()}</p>
                    {details.key && <p className="text-xs text-gray-400 truncate">{details.key}</p>}
                    {details.error && <p className="text-xs text-red-500">{details.error}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {log.status === 'success' ? 'OK' : 'Errore'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
