import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useBranding } from '../context/BrandingContext'
import { Activity, Search, ChevronLeft, ChevronRight, ChevronDown, Loader2, Mail, Download, RotateCcw, LogIn, Key, Trash2, Plus, Edit2, ShieldCheck, ShieldAlert, Shield, RefreshCw, CheckCircle2, AlertCircle, Clock, Inbox } from 'lucide-react'

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

const formatDateShort = (d) => {
  try { return format(new Date(d), "dd/MM HH:mm", { locale: it }) } catch { return d }
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
            const isSelected = selectedLog?.id === log.id
            return (
              <React.Fragment key={log.id}>
                <tr className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedLog(isSelected ? null : log)}>
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
                  <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-400 mono">
                    <div className="flex items-center justify-between gap-2">
                      <span>{log.ip_address || '—'}</span>
                      <ChevronDown size={13} className={`text-gray-400 transition-transform shrink-0 ${isSelected ? 'rotate-180' : ''}`} />
                    </div>
                  </td>
                </tr>
                {isSelected && (
                  <tr className="border-b border-blue-100">
                    <td colSpan={5} className="px-6 py-3 bg-blue-50">
                      <div className="space-y-1">{formatDetails(log.details)}</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
    try { await api.post('/admin/settings', { av_notify_on_infection: avNotify }) }
    catch {} finally { setSavingSettings(false) }
  }

  return (
    <div className="space-y-4">
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
                  <td className="px-4 py-3 text-xs text-red-600">{log.viruses?.length > 0 ? log.viruses.join(', ') : '—'}</td>
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

function SyncLog() {
  const [mailboxes, setMailboxes] = useState([])
  const [expanded, setExpanded] = useState({})
  const [logs, setLogs] = useState({})
  const [loadingLogs, setLoadingLogs] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchSyncStatus = useCallback(async () => {
    try {
      const [mbRes, statusRes] = await Promise.all([
        api.get('/admin/mailboxes'),
        api.get('/admin/sync-status')
      ])
      const statusByMailbox = {}
      statusRes.data.forEach(log => {
        if (!statusByMailbox[log.mailbox_id]) statusByMailbox[log.mailbox_id] = []
        statusByMailbox[log.mailbox_id].push(log)
      })
      const mbWithStatus = mbRes.data.map(m => ({
        ...m,
        lastSync: statusByMailbox[m.id]?.[0] || null,
        syncCount: statusByMailbox[m.id]?.length || 0
      }))
      setMailboxes(mbWithStatus)
      setLastUpdate(new Date())
    } catch {} finally { setLoading(false) }
  }, [])

  // Polling ogni 5 secondi
  useEffect(() => {
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchSyncStatus])

  const toggleExpand = async (mailboxId) => {
    const isExpanded = expanded[mailboxId]
    setExpanded(prev => ({ ...prev, [mailboxId]: !isExpanded }))
    if (!isExpanded && !logs[mailboxId]) {
      setLoadingLogs(prev => ({ ...prev, [mailboxId]: true }))
      try {
        const res = await api.get(`/admin/mailboxes/${mailboxId}/sync-status`)
        setLogs(prev => ({ ...prev, [mailboxId]: res.data }))
      } catch {}
      setLoadingLogs(prev => ({ ...prev, [mailboxId]: false }))
    }
  }

  const refreshLogs = async (mailboxId) => {
    setLoadingLogs(prev => ({ ...prev, [mailboxId]: true }))
    try {
      const res = await api.get(`/admin/mailboxes/${mailboxId}/sync-status`)
      setLogs(prev => ({ ...prev, [mailboxId]: res.data }))
    } catch {}
    setLoadingLogs(prev => ({ ...prev, [mailboxId]: false }))
  }

  return (
    <div className="space-y-4">
      {/* Info retention */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
        <Clock size={16} className="text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800">
          I log di sincronizzazione vengono conservati per <strong>60 giorni</strong> e poi eliminati automaticamente.
        </p>
        {lastUpdate && (
          <span className="ml-auto text-xs text-amber-600 shrink-0">
            Aggiornato: {format(lastUpdate, 'HH:mm:ss')}
          </span>
        )}
      </div>

      {/* Lista caselle */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="text-center py-16">
          <Inbox size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nessuna casella configurata</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mailboxes.map(m => {
            const isExpanded = expanded[m.id]
            const mailboxLogs = logs[m.id] || []
            const isLoading = loadingLogs[m.id]
            const last = m.lastSync

            return (
              <div key={m.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Header casella */}
                <button
                  onClick={() => toggleExpand(m.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-blue-600">
                    {m.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{m.email}</p>
                    <p className="text-xs text-gray-500">{m.client_name || 'Non assegnata'}</p>
                  </div>

                  {/* Stato ultima sync */}
                  {last ? (
                    <div className="flex items-center gap-3 shrink-0">
                      {last.status === 'running' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                          <Loader2 size={12} className="animate-spin" /> Sync in corso...
                        </span>
                      ) : last.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                          <CheckCircle2 size={12} /> {last.emails_synced} email
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
                          <AlertCircle size={12} /> Errore
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDateShort(last.finished_at || last.started_at)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 shrink-0">Nessuna sync</span>
                  )}

                  <ChevronDown size={16} className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Log espanso */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    <div className="flex items-center justify-between px-5 py-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Storico sincronizzazioni</p>
                      <button onClick={(e) => { e.stopPropagation(); refreshLogs(m.id) }}
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
                        <RefreshCw size={11} /> Aggiorna
                      </button>
                    </div>
                    <div className="px-5 pb-4 space-y-2 max-h-72 overflow-y-auto">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 size={18} className="animate-spin text-gray-400" />
                        </div>
                      ) : mailboxLogs.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nessun log disponibile</p>
                      ) : mailboxLogs.map((log, i) => (
                        <div key={i} className={`rounded-lg border p-3 ${
                          log.status === 'completed' ? 'bg-green-50 border-green-100' :
                          log.status === 'running' ? 'bg-blue-50 border-blue-200' :
                          'bg-red-50 border-red-100'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {log.status === 'completed'
                                ? <CheckCircle2 size={13} className="text-green-500" />
                                : log.status === 'running'
                                ? <Loader2 size={13} className="animate-spin text-blue-500" />
                                : <AlertCircle size={13} className="text-red-500" />}
                              <span className={`text-xs font-semibold capitalize ${
                                log.status === 'completed' ? 'text-green-700' :
                                log.status === 'running' ? 'text-blue-700' : 'text-red-700'
                              }`}>{log.status}</span>
                              {log.emails_synced > 0 && (
                                <span className="text-xs text-gray-500">· {log.emails_synced} email scaricate</span>
                              )}
                              {log.emails_synced === 0 && log.status === 'completed' && (
                                <span className="text-xs text-gray-400">· Nessuna novità</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock size={10} />
                              {formatDate(log.started_at)}
                            </div>
                          </div>
                          {log.finished_at && (
                            <p className="text-xs text-gray-400">
                              Durata: {Math.round((new Date(log.finished_at) - new Date(log.started_at)) / 1000)}s
                            </p>
                          )}
                          {log.error && (
                            <p className="text-xs text-red-600 mt-1 font-mono bg-red-100 rounded px-2 py-1 break-all">{log.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
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
          <p className="text-sm text-gray-500 mt-0.5">Attività sistema, sincronizzazioni e scansioni antivirus</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        <button onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'activity' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <Activity size={14} /> Log Attività
        </button>
        <button onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'sync' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <RefreshCw size={14} /> Log Sync
        </button>
        <button onClick={() => setActiveTab('av')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'av' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <Shield size={14} /> Log AV
        </button>
      </div>

      {activeTab === 'activity' && <ActivityLog />}
      {activeTab === 'sync' && <SyncLog />}
      {activeTab === 'av' && <AvLog />}
    </div>
  )
}
