import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useBranding } from '../context/BrandingContext'
import { Activity, Search, ChevronLeft, ChevronRight, Loader2, Mail, Download, RotateCcw, LogIn, Key, Trash2, Plus, Edit2, ShieldCheck, ShieldAlert, Shield } from 'lucide-react'

const ACTION_CONFIG = {
  LOGIN:                  { label: 'Accesso',            color: 'bg-green-100 text-green-700',   icon: LogIn },
  LOGIN_FAILED:           { label: 'Accesso fallito',    color: 'bg-red-100 text-red-700',       icon: LogIn },
  LOGIN_FAILED_2FA:       { label: '2FA fallito',        color: 'bg-red-100 text-red-700',       icon: Shield },
  ACCOUNT_LOCKED:         { label: 'Account bloccato',   color: 'bg-red-100 text-red-700',       icon: Shield },
  ACCOUNT_UNLOCKED:       { label: 'Account sbloccato',  color: 'bg-green-100 text-green-700',   icon: Shield },
  PASSWORD_CHANGED:       { label: 'Password cambiata',  color: 'bg-blue-100 text-blue-700',     icon: Key },
  '2FA_ENABLED':          { label: '2FA attivato',       color: 'bg-green-100 text-green-700',   icon: ShieldCheck },
  '2FA_DISABLED':         { label: '2FA disattivato',    color: 'bg-amber-100 text-amber-700',   icon: ShieldAlert },
  '2FA_RESET_BY_ADMIN':   { label: '2FA resettato',      color: 'bg-amber-100 text-amber-700',   icon: Shield },
  EMAIL_VIEWED:           { label: 'Email visualizzata', color: 'bg-gray-100 text-gray-700',     icon: Mail },
  EMAIL_EXPORTED:         { label: 'Email esportata',    color: 'bg-purple-100 text-purple-700', icon: Download },
  EMAIL_RESTORED:         { label: 'Email ripristinata', color: 'bg-orange-100 text-orange-700', icon: RotateCcw },
  USER_CREATED:           { label: 'Utente creato',      color: 'bg-green-100 text-green-700',   icon: Plus },
  USER_UPDATED:           { label: 'Utente modificato',  color: 'bg-blue-100 text-blue-700',     icon: Edit2 },
  USER_DELETED:           { label: 'Utente eliminato',   color: 'bg-red-100 text-red-700',       icon: Trash2 },
  CLIENT_CREATED:         { label: 'Cliente creato',     color: 'bg-green-100 text-green-700',   icon: Plus },
  CLIENT_UPDATED:         { label: 'Cliente modificato', color: 'bg-blue-100 text-blue-700',     icon: Edit2 },
  CLIENT_DELETED:         { label: 'Cliente eliminato',  color: 'bg-red-100 text-red-700',       icon: Trash2 },
  MAILBOX_CREATED:        { label: 'Casella aggiunta',   color: 'bg-green-100 text-green-700',   icon: Plus },
  MAILBOX_UPDATED:        { label: 'Casella modificata', color: 'bg-blue-100 text-blue-700',     icon: Edit2 },
  MAILBOX_DELETED:        { label: 'Casella eliminata',  color: 'bg-red-100 text-red-700',       icon: Trash2 },
  BACKUP_COMPLETED:       { label: 'Backup completato',  color: 'bg-green-100 text-green-700',   icon: Activity },
  BACKUP_RESTORED:        { label: 'Backup ripristinato',color: 'bg-orange-100 text-orange-700', icon: Activity },
  ATTACHMENT_BLOCKED_AV:  { label: 'Allegato bloccato',  color: 'bg-red-100 text-red-700',       icon: ShieldAlert },
}

const AV_STATUS_CONFIG = {
  clean:    { label: 'Pulito',   color: 'bg-green-100 text-green-700',  icon: ShieldCheck },
  infected: { label: 'Infetto',  color: 'bg-red-100 text-red-700',      icon: ShieldAlert },
  skipped:  { label: 'Saltato',  color: 'bg-gray-100 text-gray-600',    icon: Shield },
}

const formatDate = (d) => {
  try { return format(new Date(d), "dd MMM yyyy HH:mm:ss", { locale: it }) } catch { return d }
}

function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (search) params.action = search
      const res = await api.get('/admin/logs', { params })
      setLogs(res.data.logs || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const formatDetails = (details) => {
    if (!details) return null
    try {
      const d = typeof details === 'string' ? JSON.parse(details) : details
      return Object.entries(d).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-gray-400 font-medium min-w-24">{k}:</span>
          <span className="text-gray-700">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))
    } catch { return <span className="text-xs text-gray-500">{String(details)}</span> }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Filtra per azione (es. LOGIN, EMAIL)..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
        </div>
        <span className="text-sm text-gray-500">{total} eventi</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Ora</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Utente</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Azione</th>
            <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dettagli</th>
            <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="text-center py-16"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-16"><Activity size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">Nessun evento</p></td></tr>
          ) : logs.map(log => {
            const config = ACTION_CONFIG[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-600', icon: Activity }
            const Icon = config.icon
            return (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}>
                <td className="px-4 py-3 text-xs text-gray-500 mono whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-4 py-3">
                  {log.user_email ? (
                    <div><p className="text-sm font-medium text-gray-900">{log.user_name || log.user_email}</p><p className="text-xs text-gray-400">{log.user_email}</p></div>
                  ) : <span className="text-xs text-gray-400 italic">Sistema</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.color}`}>
                    <Icon size={11} />{config.label}
                  </span>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                  {log.details ? (() => { try { const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details; return Object.values(d).slice(0,2).join(' · ') } catch { return log.details } })() : '—'}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-400 mono">{log.ip_address || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {selectedLog && (
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dettagli evento</p>
          <div className="space-y-1">{formatDetails(selectedLog.details)}</div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={15} /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function AvLog() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [avNotify, setAvNotify] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const { branding } = useBranding()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (filter !== 'all') params.status = filter
      const res = await api.get('/admin/av-logs', { params })
      setLogs(res.data.logs || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }, [page, filter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    api.get('/admin/settings').then(r => {
      setAvNotify(r.data.av_notify_on_infection === 'true')
    }).catch(() => {})
  }, [])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.post('/admin/settings', { av_notify_on_infection: avNotify })
    } catch {}
    finally { setSavingSettings(false) }
  }

  return (
    <div className="space-y-4">
      {/* AV Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Notifica email se allegato infetto</p>
            <p className="text-xs text-gray-500">Invia email al superadmin quando viene rilevato un virus</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAvNotify(!avNotify)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${avNotify ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${avNotify ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
          <button onClick={saveSettings} disabled={savingSettings}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
            style={{ background: branding.primary_color || '#2563eb' }}>
            {savingSettings ? <Loader2 size={12} className="animate-spin" /> : 'Salva'}
          </button>
        </div>
      </div>

      {/* AV Log table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[['all','Tutti'],['clean','Puliti'],['infected','Infetti'],['skipped','Saltati']].map(([id,label]) => (
              <button key={id} onClick={() => { setFilter(id); setPage(1) }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter===id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500 ml-auto">{total} scansioni</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Ora</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">File</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Virus</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Scansionato da</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-16"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-16">
                <ShieldCheck size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Nessuna scansione registrata</p>
              </td></tr>
            ) : logs.map(log => {
              const config = AV_STATUS_CONFIG[log.status] || AV_STATUS_CONFIG.skipped
              const Icon = config.icon
              return (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 mono whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{log.filename || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.color}`}>
                      <Icon size={11} />{config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">
                    {log.viruses?.length > 0 ? log.viruses.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.user_name || log.user_email || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Logs() {
  const [activeTab, setActiveTab] = useState('activity')

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto h-full overflow-y-auto fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Attività sistema e scansioni antivirus</p>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        <button onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'activity' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <Activity size={14} /> Log Attività
        </button>
        <button onClick={() => setActiveTab('av')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'av' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <Shield size={14} /> Log AV
        </button>
      </div>

      {activeTab === 'activity' ? <ActivityLog /> : <AvLog />}
    </div>
  )
}
