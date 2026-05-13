import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { Search, Filter, Download, RotateCcw, Loader2, Mail, ChevronLeft, ChevronRight, Calendar, Inbox, ChevronDown, Folder, FolderOpen, Building2, Paperclip, Shield, ShieldCheck, ShieldAlert, HelpCircle, Trash2, X, RefreshCw, CheckSquare, Square } from 'lucide-react'

// Folder tree component
function FolderTree({ folders, selectedFolder, onSelect }) {
  const [expanded, setExpanded] = useState({})
  const buildTree = (folders) => {
    const tree = {}
    folders.forEach(f => {
      const parts = f.path.split('.')
      let node = tree
      parts.forEach((part, i) => {
        if (!node[part]) node[part] = { _path: parts.slice(0, i + 1).join('.'), _children: {} }
        node = node[part]._children
      })
    })
    return tree
  }
  const renderTree = (node, depth = 0) => {
    return Object.entries(node).map(([name, data]) => {
      const hasChildren = Object.keys(data._children).length > 0
      const isSelected = selectedFolder === data._path
      const isExpanded = expanded[data._path]
      return (
        <div key={data._path}>
          <div className={`flex items-center w-full rounded-lg transition-colors text-left ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}>
            <button onClick={() => onSelect(isSelected ? null : data._path)}
              className="flex items-center gap-2 flex-1 py-1.5 text-sm text-left">
              {hasChildren ? (isExpanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />) : (<Inbox size={14} className="shrink-0" />)}
              <span className="truncate">{name}</span>
            </button>
            {hasChildren && (
              <button onClick={() => setExpanded(e => ({ ...e, [data._path]: !e[data._path] }))} className="px-2 py-1.5">
                {isExpanded ? <ChevronDown size={12} /> : <ChevronDown size={12} className="rotate-[-90deg]" />}
              </button>
            )}
          </div>
          {hasChildren && isExpanded && <div>{renderTree(data._children, depth + 1)}</div>}
        </div>
      )
    })
  }
  const tree = buildTree(folders)
  return <div className="space-y-0.5">{renderTree(tree)}</div>
}

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const Highlight = ({ text, query }) => {
  if (!query || !text) return <span>{text || ''}</span>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  )
}

const AvShield = ({ emailId, hasAttachments, avStatus: initialStatus }) => {
  const [status, setStatus] = React.useState(initialStatus || null)
  if (!hasAttachments) return <span title="Nessun allegato" className="text-gray-200"><Shield size={14} /></span>
  const scan = async (e) => {
    e.stopPropagation()
    setStatus('loading')
    try {
      const res = await api.get(`/emails/${emailId}/scan`)
      setStatus(res.data.allClean ? 'clean' : 'infected')
    } catch { setStatus('error') }
  }
  if (status === 'loading') return <Loader2 size={14} className="animate-spin text-blue-400" />
  if (status === 'clean') return <span title="Allegati puliti" className="text-green-500"><ShieldCheck size={14} /></span>
  if (status === 'infected') return <span title="Virus rilevato!" className="text-red-500 animate-pulse"><ShieldAlert size={14} /></span>
  return <button onClick={scan} title="Clicca per scansionare" className="text-gray-300 hover:text-blue-500 transition-colors"><HelpCircle size={14} /></button>
}

export default function Dashboard() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  const savedState = (() => { try { return JSON.parse(sessionStorage.getItem('mv_dashboard_state') || '{}') } catch { return {} } })()

  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(savedState.selectedClient || null)
  const [mailboxes, setMailboxes] = useState([])
  const [selectedMailbox, setSelectedMailbox] = useState(null)
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(savedState.selectedFolder || null)
  const [emails, setEmails] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(savedState.page || 1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState(savedState.search || '')
  const [fromDate, setFromDate] = useState(savedState.fromDate || '')
  const [toDate, setToDate] = useState(savedState.toDate || '')
  const [showFilters, setShowFilters] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sortBy, setSortBy] = useState('sent_at')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(1)
  }
  const [restoreTarget, setRestoreTarget] = useState('')
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const restoredMailboxId = savedState.selectedMailboxId || null

  useEffect(() => {
    sessionStorage.setItem('mv_dashboard_state', JSON.stringify({
      selectedClient, selectedMailboxId: selectedMailbox?.id || null,
      selectedFolder, page, search, fromDate, toDate,
    }))
  }, [selectedClient, selectedMailbox, selectedFolder, page, search, fromDate, toDate])

  useEffect(() => {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      api.get('/admin/clients').then(r => setClients(r.data)).catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'superadmin' && selectedClient) {
      api.get('/emails/mailboxes/list').then(r => {
        const filtered = r.data.filter(m => m.client_id == selectedClient)
        setMailboxes(filtered)
        if (restoredMailboxId) {
          const restored = filtered.find(m => m.id == restoredMailboxId)
          if (restored) setSelectedMailbox(restored)
        }
      }).catch(() => {})
    } else if (user?.role !== 'superadmin') {
      api.get('/emails/mailboxes/list').then(r => {
        setMailboxes(r.data)
        if (restoredMailboxId) {
          const restored = r.data.find(m => m.id == restoredMailboxId)
          if (restored) setSelectedMailbox(restored)
        } else if (r.data.length === 1) setSelectedMailbox(r.data[0])
      }).catch(() => {})
    }
  }, [selectedClient, user])

  useEffect(() => {
    if (selectedMailbox) {
      api.get('/emails/folders', { params: { mailbox_id: selectedMailbox.id } }).then(r => {
        setFolders(r.data); setSelectedFolder(null)
      }).catch(() => setFolders([]))
    }
  }, [selectedMailbox])

  const fetchEmails = useCallback(async () => {
    if (!selectedMailbox) return
    setLoading(true)
    try {
      const params = {
        page, limit: 50, mailbox_id: selectedMailbox.id,
        show_deleted: 'true',  // sempre visibili
        show_restored: 'true', // sempre visibili
      }
      if (search) { params.search = search; params.fulltext = 'true' } // full-text sempre attivo
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (selectedFolder) params.path = selectedFolder
      params.sort_by = sortBy
      params.sort_dir = sortDir
      const res = await api.get('/emails', { params })
      setEmails(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch { setEmails([]) }
    finally { setLoading(false) }
  }, [selectedMailbox, page, search, fromDate, toDate, selectedFolder, sortBy, sortDir])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => selected.length === emails.length ? setSelected([]) : setSelected(emails.map(e => e.id))

  const handleDeleteSelected = async () => {
    if (!selected.length) return
    try {
      await api.post('/emails/delete', { email_ids: selected })
      setActionMsg(`${selected.length} email eliminate`)
      setSelected([])
      fetchEmails()
    } catch { setActionMsg('Errore durante eliminazione') }
    setTimeout(() => setActionMsg(''), 3000)
  }

  const handleRestoreSelected = async () => {
    if (!selected.length || !restoreTarget) return
    setRestoreLoading(true)
    try {
      const res = await api.post('/restore/imap', { email_ids: selected, target_mailbox: restoreTarget })
      const ok = res.data.results?.filter(r => r.success).length || selected.length
      setActionMsg(`${ok}/${selected.length} email ripristinate`)
      setSelected([])
      setShowRestoreModal(false)
      fetchEmails()
    } catch { setActionMsg('Errore durante restore') }
    finally { setRestoreLoading(false); setTimeout(() => setActionMsg(''), 4000) }
  }

  const handleToggleDelete = async (email, e) => {
    e.stopPropagation()
    try {
      if (email.isDeleted) {
        await api.post('/emails/undelete', { email_ids: [email.id] })
      } else {
        await api.post('/emails/delete', { email_ids: [email.id] })
      }
      fetchEmails()
    } catch {}
  }

  const handleExport = async () => {
    if (!selected.length) return
    setExportLoading(true)
    try {
      const res = await api.post('/restore/export/zip', { email_ids: selected }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `export_${format(new Date(), 'yyyyMMdd_HHmm')}.zip`
      a.click(); URL.revokeObjectURL(url)
      setActionMsg(`${selected.length} email esportate`)
    } catch { setActionMsg('Errore export') }
    finally { setExportLoading(false); setTimeout(() => setActionMsg(''), 3000) }
  }

  const handleSync = async () => {
    if (!selectedMailbox) return
    setSyncing(true)
    try {
      await api.post('/emails/sync/' + selectedMailbox.id)
      await fetchEmails()
      setActionMsg('Sincronizzazione completata')
    } catch { setActionMsg('Errore sync') }
    finally { setSyncing(false); setTimeout(() => setActionMsg(''), 3000) }
  }

  const formatDate = (d) => {
    try { return format(new Date(d), 'dd MMM yy, HH:mm', { locale: it }) } catch { return d }
  }

  return (
    <div className="flex min-h-screen md:h-screen relative">
      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg text-white flex items-center justify-center"
        style={{ background: branding.primary_color || '#2563eb' }}>
        {sidebarOpen ? <X size={20} /> : <Filter size={20} />}
      </button>

      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-72 md:w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto transform transition-transform duration-300 md:transform-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Archivio Email</h2>
          {(user?.role === 'superadmin' || user?.role === 'admin') && clients.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5"><Building2 size={11} className="inline mr-1" />Cliente</label>
              <select value={selectedClient || ''} onChange={e => { setSelectedClient(e.target.value || null); setSelectedMailbox(null); setFolders([]) }}
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1">
                <option value="">Seleziona</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </div>
          )}
          {mailboxes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5"><Inbox size={11} className="inline mr-1" />Casella</label>
              <select value={selectedMailbox?.id || ''} onChange={e => {
                const m = mailboxes.find(x => x.id == e.target.value)
                setSelectedMailbox(m || null); setSelected([]); setPage(1)
              }} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1">
                <option value="">Seleziona</option>
                {mailboxes.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </div>
          )}
        </div>

        {folders.length > 0 && (
          <div className="p-3 flex-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">Cartelle</p>
            <button onClick={() => { setSelectedFolder(null); setPage(1); setSelected([]) }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-lg transition-colors mb-1 ${!selectedFolder ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Inbox size={14} /> Tutte le email
            </button>
            <FolderTree folders={folders} selectedFolder={selectedFolder} onSelect={(p) => { setSelectedFolder(p); setPage(1); setSelected([]) }} />
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Titolo */}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 truncate">
                {selectedFolder || 'INBOX'} {selectedMailbox && <span className="text-gray-400 font-normal">· {selectedMailbox.email}</span>}
              </h1>
              {total > 0 && <p className="text-xs text-gray-400">{total.toLocaleString('it-IT')} email</p>}
            </div>

            {/* Azioni bulk */}
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{selected.length} selezionate</span>
                <button onClick={() => setShowRestoreModal(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100">
                  <RotateCcw size={12} /> Ripristina
                </button>
                <button onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">
                  <Trash2 size={12} /> Elimina
                </button>
                <button onClick={handleExport} disabled={exportLoading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100">
                  {exportLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Esporta
                </button>
              </div>
            )}

            {/* Sync */}
            {selectedMailbox && (
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync
              </button>
            )}
          </div>

          {/* Barra ricerca */}
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Cerca oggetto, mittente, testo..." onKeyDown={e => e.key === 'Escape' && setSearch('')}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              {search && <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${showFilters || fromDate || toDate ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={14} /> Filtri
            </button>
          </div>

          {/* Filtri data */}
          {showFilters && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-gray-400" />
                <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1" />
                <span className="text-xs text-gray-400">→</span>
                <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1" />
              </div>
              {(fromDate || toDate) && (
                <button onClick={() => { setFromDate(''); setToDate(''); setPage(1) }} className="text-xs text-red-500 hover:underline">Reset date</button>
              )}
            </div>
          )}

          {actionMsg && (
            <div className="mt-2 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg">{actionMsg}</div>
          )}
        </div>

        {/* Lista email */}
        <div className="flex-1 overflow-y-auto">
          {!selectedMailbox ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Mail size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Seleziona una casella email</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Mail size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Nessuna email trovata</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="w-8 px-3 py-2.5">
                    <button onClick={toggleAll}>
                      {selected.length === emails.length ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} className="text-gray-400" />}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('sent_at')}>
                    Data {sortBy === 'sent_at' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('subject')}>
                    Oggetto {sortBy === 'subject' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('sender_email')}>
                    Mittente {sortBy === 'sender_email' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="hidden md:table-cell px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Info</th>
                  <th className="w-10 px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {emails.map(email => (
                  <tr key={email.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${selected.includes(email.id) ? 'bg-blue-50' : email.isDeleted ? 'opacity-60' : ''}`}>
                    <td className="w-8 px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(email.id) }}>
                      {selected.includes(email.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} className="text-gray-300" />}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap" onClick={() => navigate(`/email/${email.id}`)}>
                      {formatDate(email.sentAt)}
                    </td>
                    <td className="px-4 py-3" onClick={() => navigate(`/email/${email.id}`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-900 truncate max-w-xs">
                          <Highlight text={email.subject || '(nessun oggetto)'} query={search} />
                        </span>
                        {email.isDeleted && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 shrink-0">
                            <Trash2 size={9} /> Eliminata
                          </span>
                        )}
                        {email.isRestored && !email.isDeleted && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 shrink-0">
                            <RotateCcw size={9} /> Recuperata
                          </span>
                        )}
                        {email.isPec && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 shrink-0 border border-blue-200">
                            PEC{email.pecType && email.pecType !== 'normale' ? ` · ${email.pecType}` : ''}
                          </span>
                        )}
                        {email.tags?.includes('spam') && (
                          <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">SPAM</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate sm:hidden mt-0.5">{email.senderEmail || email.senderName}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-500 truncate max-w-xs" onClick={() => navigate(`/email/${email.id}`)}>
                      <Highlight text={email.senderEmail || email.senderName || ''} query={search} />
                    </td>
                    <td className="hidden md:table-cell px-4 py-3" onClick={() => navigate(`/email/${email.id}`)}>
                      <div className="flex items-center gap-1.5">
                        <AvShield emailId={email.id} hasAttachments={email.hasAttachments} avStatus={email.avStatus} />
                        {email.hasAttachments && <Paperclip size={13} className="text-gray-400 shrink-0" />}
                        <span className="text-xs text-gray-400 truncate max-w-[80px]">{email.path || 'INBOX'}</span>
                      </div>
                    </td>
                    <td className="w-10 px-2 py-3">
                      <button
                        onClick={(e) => handleToggleDelete(email, e)}
                        title={email.isDeleted ? 'Ripristina' : 'Elimina'}
                        className={`p-1.5 rounded-lg transition-colors ${email.isDeleted ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}>
                        {email.isDeleted ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginazione */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white shrink-0">
            <p className="text-sm text-gray-500">Pagina {page} di {totalPages} · {total.toLocaleString('it-IT')} email</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal ripristino IMAP */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-2">Ripristina email nell'IMAP</h2>
            <p className="text-sm text-gray-500 mb-4">{selected.length} email verranno reinserite nella casella IMAP indicata.</p>
            <input value={restoreTarget} onChange={e => setRestoreTarget(e.target.value)}
              placeholder="Email destinazione (es. office@k2tech.it)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
            <div className="flex gap-2">
              <button onClick={handleRestoreSelected} disabled={restoreLoading || !restoreTarget}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40">
                {restoreLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Ripristina
              </button>
              <button onClick={() => setShowRestoreModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
