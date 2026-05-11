import { useState, useEffect, useCallback } from 'react'
import { Shield, Search, RefreshCw, AlertTriangle, LogIn, LogOut, Lock, Eye, Trash2, Settings, User, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../services/api'

const ACTION_CONFIG = {
  LOGIN:              { label: 'Accesso',              color: '#16a34a', bg: '#f0fdf4', icon: LogIn },
  LOGIN_FAILED:       { label: 'Accesso fallito',      color: '#dc2626', bg: '#fef2f2', icon: AlertTriangle },
  LOGIN_BLOCKED:      { label: 'Accesso bloccato',     color: '#dc2626', bg: '#fef2f2', icon: Lock },
  ACCOUNT_LOCKED:     { label: 'Account bloccato',     color: '#dc2626', bg: '#fef2f2', icon: Lock },
  LOGOUT:             { label: 'Disconnessione',       color: '#6b7280', bg: '#f9fafb', icon: LogOut },
  SUSPICIOUS_IP:      { label: 'IP sospetto',          color: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
  LOGIN_FAILED_2FA:   { label: '2FA fallito',          color: '#dc2626', bg: '#fef2f2', icon: Shield },
  USER_CREATED:       { label: 'Utente creato',        color: '#2563eb', bg: '#eff6ff', icon: User },
  USER_DELETED:       { label: 'Utente eliminato',     color: '#7c3aed', bg: '#f5f3ff', icon: Trash2 },
  MAILBOX_CREATED:    { label: 'Casella creata',       color: '#2563eb', bg: '#eff6ff', icon: Settings },
  MAILBOX_DELETED:    { label: 'Casella eliminata',    color: '#7c3aed', bg: '#f5f3ff', icon: Trash2 },
  SETTINGS_CHANGED:   { label: 'Impostazioni',         color: '#2563eb', bg: '#eff6ff', icon: Settings },
  EMAIL_VIEWED:       { label: 'Email visualizzata',   color: '#6b7280', bg: '#f9fafb', icon: Eye },
}

const getActionConfig = (action) => ACTION_CONFIG[action] || { label: action, color: '#6b7280', bg: '#f9fafb', icon: Shield }

const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  // Filtri
  const [filterAction, setFilterAction] = useState('')
  const [filterIp, setFilterIp] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, limit: 50 }
      if (filterAction) params.action = filterAction
      if (filterIp) params.ip = filterIp
      if (filterFrom) params.from = filterFrom
      if (filterTo) params.to = filterTo
      const res = await api.get('/admin/audit-log', { params })
      setLogs(res.data.logs)
      setTotal(res.data.total)
      setPages(res.data.pages)
      setPage(p)
    } catch {}
    setLoading(false)
  }, [filterAction, filterIp, filterFrom, filterTo])

  useEffect(() => { load(1) }, [])

  const inputClass = "text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Shield size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Audit Log</h1>
            <p className="text-xs text-gray-500">{total.toLocaleString()} eventi registrati</p>
          </div>
        </div>
        <button onClick={() => load(1)} disabled={loading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Aggiorna
        </button>
      </div>

      {/* Filtri */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Azione</label>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={inputClass}>
            <option value="">Tutte</option>
            {Object.entries(ACTION_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">IP</label>
          <input value={filterIp} onChange={e => setFilterIp(e.target.value)} placeholder="es. 192.168" className={inputClass} style={{width: '140px'}} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Dal</label>
          <input type="datetime-local" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Al</label>
          <input type="datetime-local" value={filterTo} onChange={e => setFilterTo(e.target.value)} className={inputClass} />
        </div>
        <button onClick={() => load(1)} className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <Search size={14} /> Cerca
        </button>
        <button onClick={() => { setFilterAction(''); setFilterIp(''); setFilterFrom(''); setFilterTo(''); setTimeout(() => load(1), 0) }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          Reset
        </button>
      </div>

      {/* Tabella */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">Nessun evento trovato</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => {
              const cfg = getActionConfig(log.action)
              const Icon = cfg.icon
              const isExpanded = expanded === log.id
              return (
                <div key={log.id}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : log.id)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                    {/* Badge azione */}
                    <div style={{ background: cfg.bg, color: cfg.color }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 min-w-[140px]">
                      <Icon size={11} />
                      {cfg.label}
                    </div>
                    {/* Utente */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {log.user_name || log.user_email || <span className="text-gray-400 italic">Sistema</span>}
                      </p>
                      {log.user_email && log.user_name && (
                        <p className="text-xs text-gray-400 truncate">{log.user_email}</p>
                      )}
                    </div>
                    {/* IP */}
                    <div className="text-xs font-mono text-gray-500 shrink-0 hidden sm:block w-32 truncate">
                      {log.ip_address || '—'}
                    </div>
                    {/* Data */}
                    <div className="text-xs text-gray-400 shrink-0 hidden md:block">
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                  {/* Dettagli espansi */}
                  {isExpanded && log.details && (
                    <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                      <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto mt-2">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(log.created_at)}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Paginazione */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Pagina {page} di {pages} · {total.toLocaleString()} eventi</p>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page === 1 || loading}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft size={14} /> Precedente
            </button>
            <button onClick={() => load(page + 1)} disabled={page === pages || loading}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              Successiva <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
