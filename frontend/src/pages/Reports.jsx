import { useState, useEffect, useRef, useCallback } from 'react'
import { Bug, Lightbulb, MessageCircle, Send, ChevronRight, Plus, ArrowLeft, RefreshCw, Clock, CheckCircle, AlertCircle, Loader2, AlertTriangle } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const TYPE_CONFIG = {
  bug:  { label: 'Bug', icon: Bug, color: '#dc2626', bg: '#fef2f2' },
  idea: { label: 'Idea', icon: Lightbulb, color: '#d97706', bg: '#fffbeb' },
  other: { label: 'Altro', icon: MessageCircle, color: '#6366f1', bg: '#eef2ff' },
}

const STATUS_CONFIG = {
  open:        { label: 'Aperta',      color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'In corso',    color: '#d97706', bg: '#fffbeb' },
  resolved:    { label: 'Risolta',     color: '#16a34a', bg: '#f0fdf4' },
  closed:      { label: 'Chiusa',      color: '#6b7280', bg: '#f9fafb' },
}

const PRIORITY_CONFIG = {
  low:    { label: 'Bassa',   color: '#6b7280' },
  normal: { label: 'Normale', color: '#2563eb' },
  high:   { label: 'Alta',    color: '#dc2626' },
}

const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const Badge = ({ config, value }) => {
  const c = config[value] || config.open || {}
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '99px' }}>
      {c.label}
    </span>
  )
}

// ── Form nuova segnalazione ──
function NewReportForm({ onCreated, onCancel }) {
  const [type, setType] = useState('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!description.trim()) return setError('La descrizione è obbligatoria')
    setLoading(true); setError('')
    try {
      await api.post('/reports', { type, title: title || description.slice(0, 80), description, page_url: pageUrl })
      onCreated()
    } catch (e) {
      setError(e.displayMessage || e.response?.data?.error || 'Errore invio')
    }
    setLoading(false)
  }

  const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-gray-900">Nuova segnalazione</h2>
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipo</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button key={key} onClick={() => setType(key)}
                style={{ borderColor: type === key ? cfg.color : '#e5e7eb', background: type === key ? cfg.bg : 'white' }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all">
                <Icon size={15} style={{ color: cfg.color }} />
                <span style={{ color: type === key ? cfg.color : '#374151' }}>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Pagina */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pagina (opzionale)</label>
        <input value={pageUrl} onChange={e => setPageUrl(e.target.value)}
          placeholder="es. /admin, /settings" className={inputClass} />
      </div>

      {/* Descrizione */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Descrizione *</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
          placeholder="Descrivi cosa è successo, cosa ti aspettavi, e come riprodurre il problema. Più dettagli = fix più rapido."
          className={inputClass + " resize-none"} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={loading || !description.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Invia segnalazione
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          Annulla
        </button>
      </div>
    </div>
  )
}

// ── Thread segnalazione ──
function ReportThread({ reportId, onBack, isSuperadmin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const messagesEndRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/reports/${reportId}`)
      setData(res.data)
      setStatus(res.data.status)
      setPriority(res.data.priority)
    } catch {}
    setLoading(false)
  }, [reportId])

  useEffect(() => { load() }, [load])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [data?.messages])

  const sendMessage = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      await api.post(`/reports/${reportId}/messages`, { message })
      setMessage('')
      await load()
    } catch {}
    setSending(false)
  }

  const updateStatus = async (newStatus) => {
    try {
      await api.patch(`/reports/${reportId}`, { status: newStatus })
      setStatus(newStatus)
    } catch {}
  }

  const updatePriority = async (newPriority) => {
    try {
      await api.patch(`/reports/${reportId}`, { priority: newPriority })
      setPriority(newPriority)
    } catch {}
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
  if (!data) return <div className="text-center py-16 text-gray-500">Segnalazione non trovata</div>

  const TypeIcon = TYPE_CONFIG[data.type]?.icon || Bug

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TypeIcon size={15} style={{ color: TYPE_CONFIG[data.type]?.color }} />
            <h2 className="text-base font-semibold text-gray-900 truncate">{data.title}</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge config={STATUS_CONFIG} value={status} />
            <Badge config={PRIORITY_CONFIG} value={priority} />
            <span className="text-xs text-gray-400">{formatDate(data.created_at)}</span>
            {isSuperadmin && (
              <span className="text-xs text-gray-500">— {data.user_name || data.user_email}</span>
            )}
          </div>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600 shrink-0">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Controlli superadmin */}
      {isSuperadmin && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Stato</label>
            <select value={status} onChange={e => updateStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priorità</label>
            <select value={priority} onChange={e => updatePriority(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Descrizione originale */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-2">DESCRIZIONE</p>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.description}</p>
        {data.page_url && <p className="text-xs text-gray-400 mt-2">Pagina: {data.page_url}</p>}
      </div>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0" style={{ maxHeight: '320px' }}>
        {data.messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nessun messaggio ancora</p>
        ) : data.messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.is_staff ? 'justify-end' : 'justify-start'}`}>
            <div style={{
              maxWidth: '80%',
              background: msg.is_staff ? '#eff6ff' : 'white',
              border: `1px solid ${msg.is_staff ? '#bfdbfe' : '#e5e7eb'}`,
              borderRadius: msg.is_staff ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
            }} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: msg.is_staff ? '#2563eb' : '#374151' }}>
                  {msg.is_staff ? '⚡ Staff' : msg.sender_name || msg.sender_email}
                </span>
                <span className="text-xs text-gray-400">{formatDate(msg.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input messaggio */}
      {status !== 'closed' && (
        <div className="flex gap-2">
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Scrivi un messaggio... (Invio per inviare, Shift+Invio per andare a capo)"
            rows={2} className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <button onClick={sendMessage} disabled={sending || !message.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ──
export default function Reports() {
  const { user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'
  const [view, setView] = useState('list')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [smtpOk, setSmtpOk] = useState(null) // null=loading, true=ok, false=non configurato

  useEffect(() => {
    api.get('/reports/smtp-status').then(r => setSmtpOk(r.data.configured)).catch(() => setSmtpOk(false))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      const res = await api.get('/reports', { params })
      setReports(res.data.reports)
    } catch {}
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { if (view === 'list') load() }, [load, view])

  if (view === 'new') return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <NewReportForm
        onCreated={() => { setView('list') }}
        onCancel={() => setView('list')}
      />
    </div>
  )

  if (view === 'thread') return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col" style={{ minHeight: '600px' }}>
      <ReportThread
        reportId={selectedId}
        isSuperadmin={isSuperadmin}
        onBack={() => setView('list')}
      />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Banner SMTP non configurato */}
      {smtpOk === false && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <span className="font-semibold">Notifiche email disabilitate</span> — SMTP non configurato.
            Le segnalazioni vengono salvate ma non arriveranno email di notifica.
            {isSuperadmin && <a href="/settings?tab=smtp" className="ml-1 underline font-medium">Configura SMTP →</a>}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {isSuperadmin ? 'Segnalazioni' : 'Le mie segnalazioni'}
          </h1>
          <p className="text-xs text-gray-500">
            {isSuperadmin ? 'Gestisci le segnalazioni degli utenti' : 'Segnala bug o suggerisci miglioramenti'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperadmin && (
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutte</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <button onClick={() => setView('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={15} /> Nuova
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">Nessuna segnalazione ancora</p>
          <button onClick={() => setView('new')} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
            Crea la prima segnalazione
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => {
            const TypeIcon = TYPE_CONFIG[r.type]?.icon || Bug
            const hasUnread = r.message_count > 0
            return (
              <button key={r.id} onClick={() => { setSelectedId(r.id); setView('thread') }}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-start gap-3">
                  <div style={{ background: TYPE_CONFIG[r.type]?.bg }} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                    <TypeIcon size={16} style={{ color: TYPE_CONFIG[r.type]?.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                      <Badge config={STATUS_CONFIG} value={r.status} />
                      {PRIORITY_CONFIG[r.priority]?.label !== 'Normale' && (
                        <Badge config={PRIORITY_CONFIG} value={r.priority} />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{r.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {isSuperadmin && r.user_name && (
                        <span className="text-xs text-gray-400">{r.user_name}</span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} /> {formatDate(r.updated_at)}
                      </span>
                      {hasUnread && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <MessageCircle size={10} /> {r.message_count} messaggi
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
