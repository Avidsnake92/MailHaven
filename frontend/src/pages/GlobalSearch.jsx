import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { Search, Loader2, Mail, Paperclip, ChevronLeft, ChevronRight, Trash2, RotateCcw, Folder, X } from 'lucide-react'

const formatDateShort = (d) => {
  try {
    const date = new Date(d)
    const now = new Date()
    const diffDays = Math.floor((now - date) / 86400000)
    if (diffDays === 0) return format(date, 'HH:mm')
    if (diffDays < 7) return format(date, 'EEE HH:mm', { locale: it })
    if (date.getFullYear() === now.getFullYear()) return format(date, 'd MMM', { locale: it })
    return format(date, 'd MMM yy', { locale: it })
  } catch { return d }
}

function BadgeMini({ badgeType, isDeleted, isRestored }) {
  const type = badgeType || (isDeleted ? 'deleted' : null) || (!isDeleted && isRestored ? 'restored' : null)
  if (!type) return null
  const map = {
    archived: 'bg-gray-100 text-gray-500 border-gray-300',
    deleted:  'bg-red-100 text-red-600 border-red-200',
    restored: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  const labels = { archived: 'ARCHIVIATA', deleted: 'ELIMINATA', restored: 'RECUPERATA' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${map[type] || ''}`}>
      {labels[type] || type.toUpperCase()}
    </span>
  )
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const doSearch = useCallback(async (p = 1) => {
    if (!query.trim() || query.trim().length < 2) {
      setError('Inserisci almeno 2 caratteri')
      return
    }
    setError('')
    setLoading(true)
    setSearched(true)
    try {
      const params = { search: query.trim(), page: p, limit: 30 }
      if (fromDate) params.from_date = fromDate
      if (toDate)   params.to_date   = toDate
      const res = await api.get('/emails/global-search', { params })
      setResults(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
      setPage(p)
    } catch (err) {
      setError(err.displayMessage || 'Errore durante la ricerca')
      setResults([])
    } finally { setLoading(false) }
  }, [query, fromDate, toDate])

  const handleKey = (e) => {
    if (e.key === 'Enter') doSearch(1)
  }

  const clear = () => {
    setQuery(''); setResults([]); setSearched(false); setError('')
    setFromDate(''); setToDate(''); setTotal(0)
    inputRef.current?.focus()
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Ricerca Globale</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cerca su tutte le caselle email archiviate</p>
      </div>

      {/* Barra di ricerca */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Cerca oggetto, mittente, testo..."
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {query && (
            <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtri data */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Dal</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-xs text-gray-500">al</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(''); setToDate('') }} className="text-xs text-red-400 hover:underline">Reset</button>
          )}
          <button onClick={() => doSearch(1)} disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Cerca
          </button>
        </div>
      </div>

      {/* Errore */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Risultati */}
      {searched && !loading && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total > 0 ? <><span className="font-semibold text-gray-800">{total.toLocaleString('it-IT')}</span> risultati per "<span className="font-medium">{query}</span>"</> : 'Nessun risultato trovato'}
          </p>
          {totalPages > 1 && <p className="text-xs text-gray-400">Pag. {page}/{totalPages}</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-50">
          {results.map(email => (
            <div key={email.id}
              onClick={() => navigate(`/email/${email.id}`)}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
              <Mail size={14} className="text-gray-300 shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-500 truncate">{email.mailboxEmail}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatDateShort(email.sentAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">{email.subject || '(nessun oggetto)'}</p>
                  <BadgeMini badgeType={email.badgeType} isDeleted={email.isDeleted} isRestored={email.isRestored} />
                </div>
                <p className="text-xs text-gray-500 truncate">{email.senderName || email.senderEmail}</p>
                {email.snippet && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: email.snippet.replace(/<b>/g, '<mark class="bg-yellow-100 text-yellow-900 rounded px-0.5">').replace(/<\/b>/g, '</mark>') }} />
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <Folder size={10} className="text-gray-300" />
                  <span className="text-[10px] text-gray-400">{email.path || 'INBOX'}</span>
                  {email.hasAttachments && <Paperclip size={10} className="text-gray-300" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
          <Search size={40} strokeWidth={1} />
          <p className="text-sm text-gray-400">Nessuna email trovata per "{query}"</p>
        </div>
      )}

      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
          <Search size={40} strokeWidth={1} />
          <p className="text-sm text-gray-400">Inserisci un termine per cercare in tutte le caselle</p>
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => doSearch(page - 1)} disabled={page === 1}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm text-gray-500">Pag. {page} di {totalPages}</span>
          <button onClick={() => doSearch(page + 1)} disabled={page === totalPages}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
