import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import {
  Search, Filter, Download, RotateCcw, Loader2, Mail, ChevronLeft, ChevronRight,
  CheckSquare, Square, X, Calendar, Inbox, ChevronDown, ChevronRight as ChevronR,
  Folder, FolderOpen, Users, Building2, Paperclip
} from 'lucide-react'

// Folder tree component
function FolderTree({ folders, selectedFolder, onSelect }) {
  const [expanded, setExpanded] = useState({})

  // Build tree structure from flat paths
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
          <div
            className={`flex items-center w-full rounded-lg transition-colors text-left ${
              isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            <button
              onClick={() => onSelect(isSelected ? null : data._path)}
              className="flex items-center gap-2 flex-1 py-1.5 text-sm text-left"
            >
              {hasChildren ? (
                isExpanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />
              ) : (
                <Inbox size={14} className="shrink-0" />
              )}
              <span className="truncate">{name}</span>
            </button>
            {hasChildren && (
              <button
                onClick={() => setExpanded(e => ({ ...e, [data._path]: !e[data._path] }))}
                className="px-2 py-1.5"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronR size={12} />}
              </button>
            )}
          </div>
          {hasChildren && isExpanded && (
            <div>{renderTree(data._children, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  const tree = buildTree(folders)
  return <div className="space-y-0.5">{renderTree(tree)}</div>
}

export default function Dashboard() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  // Restore state from sessionStorage
  const savedState = (() => { try { return JSON.parse(sessionStorage.getItem('mv_dashboard_state') || '{}') } catch { return {} } })()

  // State
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
  const [showRestored, setShowRestored] = useState(false)
  const [fromDate, setFromDate] = useState(savedState.fromDate || '')
  const [toDate, setToDate] = useState(savedState.toDate || '')
  const [showFilters, setShowFilters] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState('')
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [restoredMailboxId] = useState(savedState.selectedMailboxId || null)

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('mv_dashboard_state', JSON.stringify({
      selectedClient,
      selectedMailboxId: selectedMailbox?.id || null,
      selectedFolder,
      page,
      search,
      fromDate,
      toDate,
    }))
  }, [selectedClient, selectedMailbox, selectedFolder, page, search, fromDate, toDate])

  // Load clients (superadmin only)
  useEffect(() => {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      api.get('/admin/clients').then(r => setClients(r.data)).catch(() => {})
    }
  }, [user])

  // Load mailboxes when client selected
  useEffect(() => {
    if (user?.role === 'superadmin' && selectedClient) {
      api.get('/emails/mailboxes/list').then(r => {
        const filtered = r.data.filter(m => m.client_id == selectedClient)
        setMailboxes(filtered)
        // Restore previously selected mailbox
        if (restoredMailboxId) {
          const restored = filtered.find(m => m.id == restoredMailboxId)
          if (restored) setSelectedMailbox(restored)
        }
      }).catch(() => {})
    } else if (user?.role !== 'superadmin') {
      api.get('/emails/mailboxes/list').then(r => {
        setMailboxes(r.data)
        // Restore previously selected mailbox
        if (restoredMailboxId) {
          const restored = r.data.find(m => m.id == restoredMailboxId)
          if (restored) setSelectedMailbox(restored)
        } else if (r.data.length === 1) {
          setSelectedMailbox(r.data[0])
        }
      }).catch(() => {})
    }
  }, [selectedClient, user])

  // Load folders when mailbox selected
  useEffect(() => {
    if (selectedMailbox) {
      api.get('/emails/folders', { params: { mailbox_id: selectedMailbox.id } }).then(r => {
        setFolders(r.data)
        setSelectedFolder(null)
      }).catch(() => setFolders([]))
    }
  }, [selectedMailbox])

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    if (!selectedMailbox) return
    setLoading(true)
    try {
      const params = { page, limit: 50, mailbox_id: selectedMailbox.id }
      if (search) params.search = search
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (selectedFolder) params.path = selectedFolder
      if (showRestored) params.show_restored = 'true'
      const res = await api.get('/emails', { params })
      setEmails(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch {
      setEmails([])
    } finally {
      setLoading(false)
    }
  }, [selectedMailbox, page, search, fromDate, toDate, selectedFolder, showRestored])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => selected.length === emails.length ? setSelected([]) : setSelected(emails.map(e => e.id))

  const [showExportMenu, setShowExportMenu] = useState(false)

  const handleExport = async (format = 'zip') => {
    if (!selected.length) return
    setShowExportMenu(false)
    setExportLoading(true)
    try {
      const endpoint = format === 'mbox' ? '/restore/export/mbox' : '/restore/export/zip'
      const ext = format === 'mbox' ? 'mbox' : 'zip'
      const res = await api.post(endpoint, { email_ids: selected }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `export_${format(new Date(), 'yyyyMMdd_HHmm')}.${ext}`
      a.click(); URL.revokeObjectURL(url)
      setActionMsg(`${selected.length} email esportate`)
    } catch { setActionMsg('Errore durante export') }
    finally { setExportLoading(false); setTimeout(() => setActionMsg(''), 3000) }
  }

  const handleExportMailbox = async (format = 'zip') => {
    if (!selectedMailbox) return
    setShowExportMenu(false)
    setExportLoading(true)
    try {
      const res = await api.post('/restore/export/mailbox', { mailbox_id: selectedMailbox.id }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `${selectedMailbox.email}_${format(new Date(), 'yyyyMMdd')}.zip`
      a.click(); URL.revokeObjectURL(url)
      setActionMsg('Casella esportata')
    } catch { setActionMsg('Errore durante export casella') }
    finally { setExportLoading(false); setTimeout(() => setActionMsg(''), 3000) }
  }

  const handleRestore = async () => {
    if (!selected.length || !restoreTarget) return
    setRestoreLoading(true)
    try {
      const res = await api.post('/restore/imap', { email_ids: selected, target_mailbox: restoreTarget })
      const ok = res.data.results?.filter(r => r.success).length || selected.length
      setActionMsg(`${ok}/${selected.length} email ripristinate`)
      setSelected([])
    } catch { setActionMsg('Errore durante restore') }
    finally { setRestoreLoading(false); setTimeout(() => setActionMsg(''), 4000) }
  }

  const handleRestoreFolder = async () => {
    if (!restoreTarget || !selectedFolder || !selectedMailbox) return
    setRestoreLoading(true)
    try {
      const allIds = emails.map(e => e.id)
      const res = await api.post('/restore/imap', { email_ids: allIds, target_mailbox: restoreTarget, target_folder: selectedFolder })
      setActionMsg(`Cartella ${selectedFolder} ripristinata`)
    } catch { setActionMsg('Errore durante restore cartella') }
    finally { setRestoreLoading(false); setTimeout(() => setActionMsg(''), 4000) }
  }

  const formatDate = (d) => {
    try { return format(new Date(d), 'dd MMM yy, HH:mm', { locale: it }) } catch { return d }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 relative">
      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg text-white flex items-center justify-center"
        style={{ background: branding.primary_color || '#2563eb' }}>
        {sidebarOpen ? <X size={20} /> : <Filter size={20} />}
      </button>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-40 md:z-auto
        w-72 md:w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto
        transform transition-transform duration-300 md:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Archivio Email</h2>

          {/* Client selector (superadmin) */}
          {(user?.role === 'superadmin' || user?.role === 'admin') && clients.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <Building2 size={11} className="inline mr-1" />Cliente
              </label>
              <select value={selectedClient || ''} onChange={e => { setSelectedClient(e.target.value || null); setSelectedMailbox(null); setFolders([]); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1">
                <option value="">— Seleziona —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </div>
          )}

          {/* Mailbox selector */}
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
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1">
                <option value="">— Seleziona —</option>
                {mailboxes.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Folder tree */}
        {folders.length > 0 && (
          <div className="p-3 flex-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">Cartelle</p>
            <button
              onClick={() => { setSelectedFolder(null); setPage(1); setSelected([]) }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-lg transition-colors mb-1 ${
                !selectedFolder ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              <Inbox size={14} /> Tutte le email
            </button>
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelect={(f) => { setSelectedFolder(f); setPage(1); setSelected([]) }}
            />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {selectedFolder ? selectedFolder.split('.').pop() : 'Email Archiviate'}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedMailbox ? selectedMailbox.email : 'Seleziona una casella'}
                {total > 0 && ` · ${total} email`}
              </p>
            </div>

            {/* Action bar */}
            {selected.length > 0 && (
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                <span className="text-sm font-medium text-gray-700">{selected.length} selezionate</span>
                <div className="w-px h-4 bg-gray-200" />
                {/* Export dropdown */}
                <div className="relative">
                  <button onClick={() => setShowExportMenu(m => !m)} disabled={exportLoading}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 disabled:opacity-50">
                    {exportLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Esporta
                    <ChevronDown size={12} />
                  </button>
                  {showExportMenu && (
                    <div className="absolute top-8 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                      <button onClick={() => handleExport('zip')}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        <Download size={13} className="text-blue-500" />
                        ZIP con EML
                        <span className="ml-auto text-xs text-gray-400">Outlook, Thunderbird</span>
                      </button>
                      <button onClick={() => handleExport('mbox')}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        <Download size={13} className="text-purple-500" />
                        MBOX
                        <span className="ml-auto text-xs text-gray-400">Thunderbird, Gmail</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="w-px h-4 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <input type="email" placeholder="Email destinazione..."
                    value={restoreTarget} onChange={e => setRestoreTarget(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-44" />
                  <button onClick={handleRestore} disabled={restoreLoading || !restoreTarget}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                    style={{ background: branding.primary_color || '#2563eb' }}>
                    {restoreLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    Ripristina
                  </button>
                </div>
                <button onClick={() => setSelected([])} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Restore folder / Export mailbox buttons */}
            {selected.length === 0 && selectedMailbox && (
              <div className="flex items-center gap-2">
                {/* Export entire mailbox */}
                <div className="relative">
                  <button onClick={() => setShowExportMenu(m => !m)} disabled={exportLoading}
                    className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {exportLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Esporta casella
                    <ChevronDown size={12} />
                  </button>
                  {showExportMenu && (
                    <div className="absolute top-10 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-48 py-1">
                      <button onClick={handleExportMailbox}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        <Download size={13} className="text-blue-500" />
                        ZIP con EML
                        <span className="ml-auto text-xs text-gray-400">Consigliato</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Restore folder */}
                {selectedFolder && emails.length > 0 && (
                  <>
                    <input type="email" placeholder="Email per ripristino cartella..."
                      value={restoreTarget} onChange={e => setRestoreTarget(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none w-52" />
                    <button onClick={handleRestoreFolder} disabled={restoreLoading || !restoreTarget}
                      className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-white disabled:opacity-50"
                      style={{ background: branding.primary_color || '#2563eb' }}>
                      {restoreLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Ripristina cartella
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action message */}
          {actionMsg && (
            <div className={`mb-4 text-sm px-4 py-3 rounded-lg border ${actionMsg.includes('Errore') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {actionMsg}
            </div>
          )}

          {/* No mailbox selected */}
          {!selectedMailbox && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Inbox size={48} className="text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Seleziona una casella email</p>
              <p className="text-gray-400 text-sm mt-1">
                {(user?.role === 'superadmin' || user?.role === 'admin') ? 'Scegli prima il cliente e poi la casella' : 'Scegli la casella dalla sidebar'}
              </p>
            </div>
          )}

          {selectedMailbox && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Search and filters */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Cerca oggetto, mittente..."
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                </div>
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${showFilters || fromDate || toDate ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <Filter size={14} /> Filtri {(fromDate || toDate) ? '·' : ''}
                </button>
              </div>

              {showFilters && (
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-600">Da:</span>
                    <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">A:</span>
                    <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" />
                  </div>
                  {(fromDate || toDate) && (
                    <button onClick={() => { setFromDate(''); setToDate(''); setPage(1) }}
                      className="text-sm text-red-500 flex items-center gap-1">
                      <X size={13} /> Cancella
                    </button>
                  )}
                </div>
              )}

              {/* Table */}
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Oggetto</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mittente</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cartella</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-16">
                      <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
                    </td></tr>
                  ) : emails.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-16">
                      <Mail size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Nessuna email trovata</p>
                    </td></tr>
                  ) : emails.map(email => (
                    <tr key={email.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${selected.includes(email.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(email.id) }}>
                        {selected.includes(email.id)
                          ? <CheckSquare size={16} className="text-blue-600" />
                          : <Square size={16} className="text-gray-300" />}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap mono text-xs"
                        onClick={() => navigate(`/email/${email.id}`)}>
                        {formatDate(email.sentAt)}
                      </td>
                      <td className="px-4 py-3 max-w-xs" onClick={() => navigate(`/email/${email.id}`)}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{email.subject || '(Nessun oggetto)'}</p>
                          {email.tags?.includes('spam') && (
                            <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-600">SPAM</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate sm:hidden mt-0.5">{email.senderEmail || email.senderName}</p>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-600 truncate max-w-xs"
                        onClick={() => navigate(`/email/${email.id}`)}>
                        {email.senderEmail || email.senderName}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3" onClick={() => navigate(`/email/${email.id}`)}>
                        <div className="flex items-center gap-1.5">
                          {email.hasAttachments && (
                            <Paperclip size={13} className="text-gray-400 shrink-0" />
                          )}
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            <Inbox size={10} />
                            {email.path || 'INBOX'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
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
