import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import {
  ShieldAlert, Trash2, Loader2, Mail, ChevronLeft, ChevronRight,
  Building2, Inbox, RefreshCw, Settings, CheckSquare, Square, X, AlertTriangle
} from 'lucide-react'

const formatDate = (d) => {
  try { return format(new Date(d), 'dd MMM yy, HH:mm', { locale: it }) } catch { return d }
}

const scoreColor = (score) => {
  if (score >= 10) return 'text-red-600 bg-red-50'
  if (score >= 5) return 'text-orange-600 bg-orange-50'
  return 'text-yellow-600 bg-yellow-50'
}

export default function Antispam() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [mailboxes, setMailboxes] = useState([])
  const [selectedMailbox, setSelectedMailbox] = useState(null)
  const [emails, setEmails] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [threshold, setThreshold] = useState(5)
  const [showSettings, setShowSettings] = useState(false)
  const [selected, setSelected] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      api.get('/admin/clients').then(r => setClients(r.data)).catch(() => {})
    }
    api.get('/spam/settings').then(r => setThreshold(r.data.threshold)).catch(() => {})
  }, [user])

  useEffect(() => {
    if (user?.role === 'superadmin' && selectedClient) {
      api.get('/emails/mailboxes/list').then(r => {
        setMailboxes(r.data.filter(m => m.client_id == selectedClient))
        setSelectedMailbox(null)
      }).catch(() => {})
    } else if (user?.role !== 'superadmin') {
      api.get('/emails/mailboxes/list').then(r => {
        setMailboxes(r.data)
        if (r.data.length === 1) setSelectedMailbox(r.data[0])
      }).catch(() => {})
    }
  }, [selectedClient, user])

  const fetchSpam = useCallback(async () => {
    if (!selectedMailbox) return
    setLoading(true)
    try {
      const res = await api.get('/spam', {
        params: { mailbox_id: selectedMailbox.id, threshold, page, limit: 50 }
      })
      setEmails(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch { setEmails([]) }
    finally { setLoading(false) }
  }, [selectedMailbox, threshold, page])

  useEffect(() => { fetchSpam() }, [fetchSpam])

  const handleAnalyze = async () => {
    if (!selectedMailbox) return
    setAnalyzing(true); setMsg(''); setError('')
    try {
      await api.post(`/spam/analyze/${selectedMailbox.id}`)
      setMsg('Analisi avviata — potrebbe richiedere alcuni minuti. Ricarica tra poco.')
      setTimeout(() => { setMsg(''); fetchSpam() }, 5000)
    } catch (err) { setError(err.response?.data?.error || 'Errore') }
    finally { setAnalyzing(false) }
  }

  const handleSaveThreshold = async () => {
    try {
      await api.post('/spam/settings', { threshold })
      setShowSettings(false)
      setMsg(`Soglia aggiornata a ${threshold}`)
      setTimeout(() => { setMsg(''); fetchSpam() }, 1000)
    } catch { setError('Errore salvataggio') }
  }

  const handleDelete = async (emailId) => {
    if (!window.confirm('Eliminare questa email dall\'archivio? L\'operazione è irreversibile.')) return
    setDeleting(true)
    try {
      await api.delete(`/spam/${emailId}`)
      setEmails(e => e.filter(x => x.email_id !== emailId))
      setMsg('Email eliminata')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) { setError(err.response?.data?.error || 'Errore eliminazione') }
    finally { setDeleting(false) }
  }

  const handleDeleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`Eliminare ${selected.length} email dall'archivio? L'operazione è irreversibile.`)) return
    setDeleting(true)
    let ok = 0
    for (const id of selected) {
      try { await api.delete(`/spam/${id}`); ok++ } catch {}
    }
    setEmails(e => e.filter(x => !selected.includes(x.email_id)))
    setSelected([])
    setMsg(`${ok}/${selected.length} email eliminate`)
    setTimeout(() => setMsg(''), 3000)
    setDeleting(false)
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => selected.length === emails.length ? setSelected([]) : setSelected(emails.map(e => e.email_id))

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Antispam</h2>

          {(user?.role === 'superadmin' || user?.role === 'admin') && clients.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <Building2 size={11} className="inline mr-1" />Cliente
              </label>
              <select value={selectedClient || ''} onChange={e => setSelectedClient(e.target.value || null)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="">— Seleziona —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </div>
          )}

          {mailboxes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <Inbox size={11} className="inline mr-1" />Casella
              </label>
              <select value={selectedMailbox?.id || ''} onChange={e => {
                const m = mailboxes.find(x => x.id == e.target.value)
                setSelectedMailbox(m || null)
                setSelected([])
                setPage(1)
              }}
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
                <option value="">— Seleziona —</option>
                {mailboxes.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Spam settings */}
        <div className="p-4">
          <button onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 w-full">
            <Settings size={13} /> Impostazioni soglia
          </button>
          {showSettings && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">Score minimo per considerare spam:</p>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100" value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none" />
                <span className="text-xs text-gray-500">punti</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[1, 3, 5, 10, 20].map(v => (
                  <button key={v} onClick={() => setThreshold(v)}
                    className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${threshold === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                    {v}
                  </button>
                ))}
              </div>
              {user?.role === 'superadmin' ? (
                <button onClick={handleSaveThreshold}
                  className="w-full text-xs font-medium py-1.5 rounded-lg text-white"
                  style={{ background: branding.primary_color || '#2563eb' }}>
                  Salva soglia (globale)
                </button>
              ) : (
                <p className="text-xs text-gray-400">La soglia qui filtra solo la tua vista. Il valore globale lo imposta il superadmin.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert size={20} className="text-orange-500" />
                Antispam
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedMailbox ? selectedMailbox.email : 'Seleziona una casella'}
                {total > 0 && ` · ${total} email con score ≥ ${threshold}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selected.length > 0 && (
                <button onClick={handleDeleteSelected} disabled={deleting}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Elimina {selected.length} selezionate
                </button>
              )}
              {selectedMailbox && (
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {analyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Analizza casella
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{msg}</div>}
          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

          {!selectedMailbox ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ShieldAlert size={48} className="text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Seleziona una casella email</p>
              <p className="text-gray-400 text-sm mt-1">
                {(user?.role === 'superadmin' || user?.role === 'admin') ? 'Scegli prima il cliente e poi la casella' : 'Scegli la casella dalla sidebar'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                        {selected.length === emails.length && emails.length > 0
                          ? <CheckSquare size={16} className="text-blue-600" />
                          : <Square size={16} />}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Oggetto</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mittente</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-16">
                      <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
                    </td></tr>
                  ) : emails.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-16">
                      <ShieldAlert size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Nessuna email spam trovata</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Clicca "Analizza casella" per scansionare le email archiviate
                      </p>
                    </td></tr>
                  ) : emails.map(email => (
                    <tr key={email.email_id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected.includes(email.email_id) ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(email.email_id) }}>
                        {selected.includes(email.email_id)
                          ? <CheckSquare size={16} className="text-red-500" />
                          : <Square size={16} className="text-gray-300" />}
                      </td>
                      <td className="px-4 py-3" onClick={() => navigate(`/email/${email.email_id}`)}>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${scoreColor(email.score)}`}>
                          <AlertTriangle size={10} />
                          {email.score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap mono"
                        onClick={() => navigate(`/email/${email.email_id}`)}>
                        {formatDate(email.sent_at)}
                      </td>
                      <td className="px-4 py-3 max-w-xs" onClick={() => navigate(`/email/${email.email_id}`)}>
                        <p className="text-sm font-medium text-gray-900 truncate">{email.subject || '(Nessun oggetto)'}</p>
                        <p className="text-xs text-gray-400 sm:hidden truncate">{email.sender_email}</p>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-600 truncate max-w-xs"
                        onClick={() => navigate(`/email/${email.email_id}`)}>
                        {email.sender_email}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(email.email_id)} disabled={deleting}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                      <ChevronLeft size={15} />
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
