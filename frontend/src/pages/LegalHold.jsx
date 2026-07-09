import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldCheck, ShieldOff, Search, RefreshCw, AlertTriangle, Calendar, User, Inbox } from 'lucide-react'
import api from '../services/api'

const formatDate = (d) => d ? new Date(d).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

export default function LegalHold() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [releasing, setReleasing] = useState(false)
  const [search, setSearch] = useState('')
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/emails/legal-hold/list?page=${page}&limit=${LIMIT}`)
      setItems(res.data.items)
      setTotal(res.data.total)
    } catch {}
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.id)))
  }

  const releaseHold = async () => {
    if (!selected.size) return
    if (!confirm(`Rimuovere il Legal Hold da ${selected.size} email? Le email torneranno modificabili.`)) return
    setReleasing(true)
    try {
      await api.post('/emails/legal-hold', { email_ids: [...selected], enable: false })
      setSelected(new Set())
      load()
    } catch (e) {
      alert('Errore: ' + (e.response?.data?.error || e.message))
    }
    setReleasing(false)
  }

  const filtered = items.filter(i =>
    !search ||
    i.subject?.toLowerCase().includes(search.toLowerCase()) ||
    i.sender_email?.toLowerCase().includes(search.toLowerCase()) ||
    i.mailbox_email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <Shield size={18} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Legal Hold</h1>
            <p className="text-xs text-gray-500">
              {total > 0 ? `${total.toLocaleString('it-IT')} email in conservazione legale` : 'Nessuna email in Legal Hold'}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
        </button>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Cosa è il Legal Hold?</p>
          <p className="text-amber-700">Le email in Legal Hold sono protette da qualsiasi eliminazione — né manuale né automatica da policy. Usato per conservare prove in caso di indagini legali, audit o contenziosi.</p>
        </div>
      </div>

      {/* Toolbar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per oggetto, mittente..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          {selected.size > 0 && (
            <button onClick={releaseHold} disabled={releasing}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60">
              <ShieldOff size={14} />
              {releasing ? 'Rimozione...' : `Rimuovi Hold (${selected.size})`}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-blue-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nessuna email in Legal Hold</p>
          <p className="text-xs text-gray-400 mt-1">Puoi impostare un Legal Hold dal viewer email selezionando le email e cliccando "Legal Hold"</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide gap-3">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={selectAll} className="rounded" />
            <span className="flex-1">Email</span>
            <span className="w-36 hidden md:block">Casella</span>
            <span className="w-36 hidden lg:block">In Hold dal</span>
            <span className="w-28 hidden lg:block">Da</span>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(item => (
              <div key={item.id}
                className={`flex items-center px-4 py-3 gap-3 hover:bg-gray-50 transition-colors ${selected.has(item.id) ? 'bg-amber-50' : ''}`}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="rounded shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                      <Shield size={10} /> Hold
                    </span>
                    <p className="text-sm font-medium text-gray-900 truncate">{item.subject || '(senza oggetto)'}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {item.sender_email} · <span className="text-gray-500">{item.legal_hold_reason || 'Nessun motivo specificato'}</span>
                  </p>
                </div>
                <div className="w-36 hidden md:block text-xs text-gray-500 truncate">
                  <Inbox size={11} className="inline mr-1" />{item.mailbox_email}
                </div>
                <div className="w-36 hidden lg:block text-xs text-gray-500">
                  <Calendar size={11} className="inline mr-1" />{formatDate(item.legal_hold_at)}
                </div>
                <div className="w-28 hidden lg:block text-xs text-gray-500 truncate">
                  <User size={11} className="inline mr-1" />{item.held_by_name || 'Admin'}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">{total.toLocaleString('it-IT')} email totali</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p-1)}
                  className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  ← Precedente
                </button>
                <span className="px-3 py-1 text-xs text-gray-500">
                  {page} / {Math.ceil(total / LIMIT)}
                </span>
                <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p+1)}
                  className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  Successiva →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

