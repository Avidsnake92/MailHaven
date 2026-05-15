import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import {
  Search, Filter, Download, RotateCcw, Loader2, Mail, ChevronLeft, ChevronRight,
  Calendar, Inbox, ChevronDown, ChevronUp, Folder, FolderOpen, Building2,
  Paperclip, Shield, ShieldCheck, ShieldAlert, HelpCircle, Trash2, X,
  RefreshCw, CheckSquare, Square, ArrowUpDown, User, Clock,
  AlertCircle, ExternalLink, Menu, Database, Server
} from 'lucide-react'

// ─── Resizable divider hook ───────────────────────────────────────────────────
function useResizable(initialWidth, min, max) {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const widthRef = useRef(initialWidth)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = widthRef.current
    document.documentElement.style.setProperty('cursor', 'col-resize', 'important')
    document.documentElement.style.setProperty('user-select', 'none', 'important')
    document.documentElement.style.setProperty('pointer-events', 'none', 'important')
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const newW = Math.min(max, Math.max(min, startW.current + delta))
      widthRef.current = newW
      setWidth(newW)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.documentElement.style.removeProperty('cursor')
      document.documentElement.style.removeProperty('user-select')
      document.documentElement.style.removeProperty('pointer-events')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [min, max])

  return [width, onMouseDown]
}

// ─── Folder tree ────────────────────────────────────────────────────────────
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
          <div className={`flex items-center w-full rounded-md transition-colors text-left ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <button onClick={() => onSelect(isSelected ? null : data._path)}
              className="flex items-center gap-1.5 flex-1 py-1.5 text-xs text-left">
              {hasChildren
                ? (isExpanded ? <FolderOpen size={13} className="shrink-0 text-blue-400" /> : <Folder size={13} className="shrink-0 text-gray-400" />)
                : <Inbox size={13} className="shrink-0 text-gray-400" />}
              <span className="truncate">{name}</span>
            </button>
            {hasChildren && (
              <button onClick={() => setExpanded(e => ({ ...e, [data._path]: !e[data._path] }))} className="px-2 py-1.5">
                {isExpanded ? <ChevronDown size={11} /> : <ChevronDown size={11} className="rotate-[-90deg]" />}
              </button>
            )}
          </div>
          {hasChildren && isExpanded && <div>{renderTree(data._children, depth + 1)}</div>}
        </div>
      )
    })
  }
  return <div className="space-y-0.5">{renderTree(buildTree(folders))}</div>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
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

// ─── Badge email ──────────────────────────────────────────────────────────────
function EmailBadges({ email, compact = false }) {
  const size = compact ? 'text-[9px]' : 'text-[10px]'
  const px = compact ? 'px-1.5' : 'px-2'
  const ic = compact ? 8 : 9

  // Determina badge attivo: prima da badge_type (nuovo sistema), poi fallback legacy
  const badgeType = email.badgeType ||
    (email.isDeleted ? 'deleted' : null) ||
    (!email.isDeleted && email.isRestored ? 'restored' : null)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {badgeType === 'archived' && (
        <span className={`inline-flex items-center gap-0.5 ${px} py-0.5 rounded-full ${size} font-bold tracking-wide bg-gray-100 text-gray-500 border border-gray-300 shrink-0`}>
          <Folder size={ic} strokeWidth={2.5} /> ARCHIVIATA
        </span>
      )}
      {badgeType === 'deleted' && (
        <span className={`inline-flex items-center gap-0.5 ${px} py-0.5 rounded-full ${size} font-bold tracking-wide bg-red-100 text-red-600 border border-red-200 shrink-0`}>
          <Trash2 size={ic} strokeWidth={2.5} /> ELIMINATA
        </span>
      )}
      {badgeType === 'restored' && (
        <span className={`inline-flex items-center gap-0.5 ${px} py-0.5 rounded-full ${size} font-bold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0`}>
          <RotateCcw size={ic} strokeWidth={2.5} /> RECUPERATA
        </span>
      )}
      {email.isPec && (
        <span className={`inline-flex items-center gap-0.5 ${px} py-0.5 rounded-full ${size} font-bold tracking-wide bg-blue-600 text-white shrink-0`}>
          PEC{email.pecType && email.pecType !== 'normale' ? ` · ${email.pecType.toUpperCase()}` : ''}
        </span>
      )}
      {email.tags?.includes('spam') && (
        <span className={`inline-flex items-center ${px} py-0.5 rounded-full ${size} font-bold tracking-wide bg-orange-100 text-orange-600 border border-orange-200 shrink-0`}>SPAM</span>
      )}
    </div>
  )
}

// ─── AV Shield ────────────────────────────────────────────────────────────────
const AvShield = ({ emailId, hasAttachments, avStatus: initialStatus }) => {
  const [status, setStatus] = React.useState(initialStatus || null)
  if (!hasAttachments) return null
  const scan = async (e) => {
    e.stopPropagation()
    setStatus('loading')
    try {
      const res = await api.get(`/emails/${emailId}/scan`)
      setStatus(res.data.allClean ? 'clean' : 'infected')
    } catch { setStatus('error') }
  }
  if (status === 'loading') return <Loader2 size={13} className="animate-spin text-blue-400" />
  if (status === 'clean') return <span title="Allegati puliti" className="text-green-500"><ShieldCheck size={13} /></span>
  if (status === 'infected') return <span title="Virus rilevato!" className="text-red-500 animate-pulse"><ShieldAlert size={13} /></span>
  return <button onClick={scan} title="Scansiona allegati" className="text-gray-300 hover:text-blue-500 transition-colors"><HelpCircle size={13} /></button>
}

// ─── Preview pannello destro ──────────────────────────────────────────────────
function EmailPreview({ emailId, onClose, branding }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!emailId) return
    setLoading(true)
    setEmail(null)
    setContent(null)
    api.get(`/emails/${emailId}`)
      .then(r => { setEmail(r.data); setLoading(false) })
      .catch(() => setLoading(false))
    api.get(`/emails/${emailId}/content`)
      .then(r => setContent(r.data))
      .catch(() => {})
  }, [emailId])

  if (!emailId) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3 select-none">
      <Mail size={48} strokeWidth={1} />
      <p className="text-sm text-gray-400">Seleziona un'email per visualizzarla</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-blue-500" />
    </div>
  )

  if (!email) return null

  const formatDateFull = (d) => {
    try { return format(new Date(d), "dd MMMM yyyy 'alle' HH:mm", { locale: it }) } catch { return d }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-900 leading-snug flex-1">
            {email.subject || '(nessun oggetto)'}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => navigate(`/email/${emailId}`)} title="Apri a schermo intero"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <ExternalLink size={14} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
        <EmailBadges email={email} />
        <div className="mt-2.5 space-y-1.5 text-xs text-gray-500">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase w-12 shrink-0">Da</span>
            <span className="text-gray-700 font-medium">{email.senderName || email.senderEmail || '—'}</span>
            {email.senderName && email.senderEmail && (
              <span className="text-gray-400 text-[11px]">&lt;{email.senderEmail}&gt;</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase w-12 shrink-0">Data</span>
            <span>{formatDateFull(email.sentAt)}</span>
          </div>
          {email.path && (
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase w-12 shrink-0">Folder</span>
              <span>{email.path}</span>
            </div>
          )}
        </div>
      </div>

      {/* Allegati */}
      {content?.attachments?.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-100 shrink-0 bg-gray-50/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Paperclip size={11} className="text-gray-400" />
            {content.attachments.map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-white border border-gray-200 rounded-md text-gray-600 shadow-sm">
                {att.filename || `allegato_${i + 1}`}
                {att.size && <span className="text-gray-400">· {formatBytes(att.size)}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto">
        {content?.html ? (
          <iframe srcDoc={content.html} className="w-full h-full border-0"
            sandbox="allow-same-origin" title="email-content" />
        ) : content?.text ? (
          <pre className="p-5 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{content.text}</pre>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            Contenuto non disponibile
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principale ────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  const savedState = (() => {
    try { return JSON.parse(sessionStorage.getItem('mv_dashboard_state') || '{}') } catch { return {} }
  })()

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
  const [syncing, setSyncing] = useState(false)
  const [sortBy, setSortBy] = useState('sent_at')
  const [sortDir, setSortDir] = useState('desc')
  const [actionMsg, setActionMsg] = useState('')
  const [actionType, setActionType] = useState('info')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState('')
  const [confirmBulk, setConfirmBulk] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [previewId, setPreviewId] = useState(null)
  const [storage, setStorage] = useState(null)
  const restoredMailboxId = savedState.selectedMailboxId || null
  const [listWidth, onDividerMouseDown] = useResizable(320, 220, 600)

  // Persist state
  useEffect(() => {
    sessionStorage.setItem('mv_dashboard_state', JSON.stringify({
      selectedClient, selectedMailboxId: selectedMailbox?.id || null,
      selectedFolder, page, search, fromDate, toDate,
    }))
  }, [selectedClient, selectedMailbox, selectedFolder, page, search, fromDate, toDate])

  // Load clients
  useEffect(() => {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      api.get('/admin/clients').then(r => setClients(r.data)).catch(() => {})
    }
  }, [user])

  // Load mailboxes
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

  // Load folders
  useEffect(() => {
    if (selectedMailbox) {
      api.get('/emails/folders', { params: { mailbox_id: selectedMailbox.id } })
        .then(r => { setFolders(r.data); setSelectedFolder(null) })
        .catch(() => setFolders([]))
      // Carica storage info
      setStorage(null)
      api.get('/emails/storage', { params: { mailbox_id: selectedMailbox.id } })
        .then(r => setStorage(r.data))
        .catch(() => {})
    }
  }, [selectedMailbox])

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    if (!selectedMailbox) return
    setLoading(true)
    try {
      const params = {
        page, limit: 50, mailbox_id: selectedMailbox.id,
        show_deleted: 'true', show_restored: 'true',
        sort_by: sortBy, sort_dir: sortDir,
      }
      if (search) { params.search = search; params.fulltext = 'true' }
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (selectedFolder) params.path = selectedFolder
      const res = await api.get('/emails', { params })
      setEmails(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch (e) { console.error('fetchEmails error:', e) }
    finally { setLoading(false) }
  }, [selectedMailbox, page, search, fromDate, toDate, selectedFolder, sortBy, sortDir])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const showMsg = (msg, type = 'info') => {
    setActionMsg(msg); setActionType(type)
    setTimeout(() => setActionMsg(''), 3500)
  }

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(1)
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => selected.length === emails.length ? setSelected([]) : setSelected(emails.map(e => e.id))

  const handleDeleteSelected = async () => {
    if (!selected.length) return
    setBulkLoading(true)
    try {
      await api.post('/emails/delete-imap', { email_ids: selected, mailbox_id: selectedMailbox.id })
      await api.post('/emails/delete', { email_ids: selected })
      showMsg(`${selected.length} email eliminate`)
      setSelected([])
      fetchEmails()
    } catch { showMsg('Errore durante eliminazione', 'error') }
    finally { setBulkLoading(false); setConfirmBulk(null) }
  }

  const handleRestoreSelected = async () => {
    if (!selected.length || !restoreTarget) return
    setBulkLoading(true)
    try {
      const res = await api.post('/restore/imap', { email_ids: selected, target_mailbox: restoreTarget })
      const ok = res.data.results?.filter(r => r.success).length || selected.length
      showMsg(`${ok}/${selected.length} email ripristinate`)
      setSelected([])
      setConfirmBulk(null)
      fetchEmails()
    } catch { showMsg('Errore durante restore', 'error') }
    finally { setBulkLoading(false) }
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
      showMsg(`${selected.length} email esportate`)
    } catch { showMsg('Errore export', 'error') }
    finally { setExportLoading(false) }
  }

  const handleSync = async () => {
    if (!selectedMailbox || syncing) return
    setSyncing(true)
    try {
      await api.post('/emails/sync/' + selectedMailbox.id)
      await fetchEmails()
      showMsg('Sincronizzazione completata')
    } catch { showMsg('Errore sync', 'error') }
    finally { setSyncing(false) }
  }

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

  const hasActiveFilter = fromDate || toDate || selectedFolder

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* ── PANNELLO 1: Sidebar ── */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-40 md:z-auto
        w-56 bg-white border-r border-gray-200 flex flex-col shrink-0
        transform transition-transform duration-300 md:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Archivio Email</h2>
          {(user?.role === 'superadmin' || user?.role === 'admin') && clients.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wider px-1">
                Cliente
              </label>
              <select value={selectedClient || ''} onChange={e => {
                setSelectedClient(e.target.value || null)
                setSelectedMailbox(null); setFolders([])
              }} className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                <option value="">Seleziona cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {mailboxes.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wider px-1">
                Casella
              </label>
              <select value={selectedMailbox?.id || ''} onChange={e => {
                const m = mailboxes.find(x => x.id == e.target.value)
                setSelectedMailbox(m || null); setSelected([]); setPage(1); setPreviewId(null)
              }} className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                <option value="">Seleziona casella</option>
                {mailboxes.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {selectedMailbox && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1.5">Cartelle</p>
              <button onClick={() => { setSelectedFolder(null); setPage(1); setSelected([]) }}
                className={`flex items-center gap-1.5 w-full px-2 py-1.5 text-xs rounded-md transition-colors mb-0.5 ${!selectedFolder ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Inbox size={13} /> Tutte le email
                {total > 0 && !selectedFolder && (
                  <span className="ml-auto text-[10px] text-gray-400">{total.toLocaleString('it-IT')}</span>
                )}
              </button>
              <FolderTree folders={folders} selectedFolder={selectedFolder}
                onSelect={(p) => { setSelectedFolder(p); setPage(1); setSelected([]) }} />
            </>
          )}
        </div>

        {/* Storage info — in fondo alla sidebar */}
        {selectedMailbox && storage && (
          <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/60 shrink-0 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <Database size={10} className="text-gray-400 shrink-0" />
              <span>Archivio</span>
              <span className="font-semibold text-gray-700 ml-auto">{formatBytes(storage.compressed_bytes)}</span>
              {storage.ratio > 0 && <span className="text-gray-400">-{storage.ratio}%</span>}
            </div>
            {storage.imap_quota && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <Server size={10} className="text-gray-400 shrink-0" />
                  <span>IMAP</span>
                  {storage.imap_quota.limit_bytes ? (
                    <>
                      <span className="font-semibold text-gray-700 ml-auto">{formatBytes(storage.imap_quota.used_bytes)}</span>
                      <span className="text-gray-400">/ {formatBytes(storage.imap_quota.limit_bytes)}</span>
                      <span className={`font-semibold ${storage.imap_quota.percent > 80 ? 'text-red-500' : 'text-gray-500'}`}>
                        {storage.imap_quota.percent}%
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold text-gray-700 ml-auto">{storage.imap_quota.messages_total} msg</span>
                  )}
                </div>
                {storage.imap_quota.limit_bytes && (
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${storage.imap_quota.percent > 80 ? 'bg-red-400' : storage.imap_quota.percent > 60 ? 'bg-amber-400' : 'bg-blue-400'}`}
                      style={{ width: `${storage.imap_quota.percent}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── PANNELLO 2: Lista email ── */}
      <div
        className="flex flex-col border-r border-gray-200 shrink-0 bg-white"
        style={{ width: previewId ? `${listWidth}px` : undefined, flex: previewId ? 'none' : '1' }}
      >

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-gray-100 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-1 rounded text-gray-500">
              <Menu size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">
                {selectedMailbox?.email || 'Seleziona una casella'}
              </p>
              {total > 0 && <p className="text-[10px] text-gray-400">{total.toLocaleString('it-IT')} email archiviate</p>}
            </div>
            {selectedMailbox && (
              <button onClick={handleSync} disabled={syncing} title="Sincronizza ora"
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors shrink-0">
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          {/* Ricerca */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Cerca oggetto, mittente, testo..."
              onKeyDown={e => e.key === 'Escape' && setSearch('')}
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtri + selezione */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${showFilters || hasActiveFilter ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              <Filter size={10} /> Filtri{hasActiveFilter ? ' ·' : ''}
            </button>
            {selected.length > 0 && (
              <span className="text-[10px] text-blue-600 font-semibold ml-1">{selected.length} sel.</span>
            )}
          </div>

          {showFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
                className="text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <span className="text-[10px] text-gray-400">→</span>
              <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
                className="text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              {(fromDate || toDate) && (
                <button onClick={() => { setFromDate(''); setToDate(''); setPage(1) }}
                  className="text-[10px] text-red-400 hover:underline">Reset</button>
              )}
            </div>
          )}

          {/* Bulk actions */}
          {selected.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
              <button onClick={() => setConfirmBulk('restore')}
                className="flex items-center gap-1 text-[10px] px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors">
                <RotateCcw size={10} /> Ripristina
              </button>
              <button onClick={() => setConfirmBulk('delete')}
                className="flex items-center gap-1 text-[10px] px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors">
                <Trash2 size={10} /> Elimina
              </button>
              <button onClick={handleExport} disabled={exportLoading}
                className="flex items-center gap-1 text-[10px] px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors">
                {exportLoading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Export
              </button>
            </div>
          )}

          {/* Feedback / sync bar */}
          {actionMsg && (
            <div className={`text-[10px] px-2 py-1 rounded-md ${actionType === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
              {actionMsg}
            </div>
          )}
          {syncing && (
            <div className="h-0.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full w-2/5 bg-blue-500 rounded-full"
                style={{ animation: 'syncBar 1.5s ease-in-out infinite' }} />
            </div>
          )}
          <style>{`@keyframes syncBar { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>
        </div>

        {/* Header colonne */}
        {selectedMailbox && emails.length > 0 && (
          <div className="flex items-center border-b border-gray-100 bg-gray-50/80 px-2 py-1.5 shrink-0 gap-2">
            <button onClick={toggleAll} className="shrink-0">
              {selected.length === emails.length
                ? <CheckSquare size={13} className="text-blue-600" />
                : <Square size={13} className="text-gray-400" />}
            </button>
            {[
              { col: 'sent_at', label: 'Data' },
              { col: 'sender_email', label: 'Mittente' },
            ].map(({ col, label }) => {
              const active = sortBy === col
              const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown
              return (
                <button key={col} onClick={() => handleSort(col)}
                  className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide select-none transition-colors mr-2 ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'}`}>
                  {label} <Icon size={10} className={active ? '' : 'opacity-50'} />
                </button>
              )
            })}
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {!selectedMailbox ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2 select-none">
              <Mail size={40} strokeWidth={1} />
              <p className="text-xs text-gray-400">Seleziona una casella email</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="animate-spin text-blue-400" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2 select-none">
              <Mail size={40} strokeWidth={1} />
              <p className="text-xs text-gray-400">Nessuna email trovata</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {emails.map(email => {
                const isSelected = selected.includes(email.id)
                const isPreviewed = previewId === email.id
                const badgeType = email.badgeType ||
                  (email.isDeleted ? 'deleted' : null) ||
                  (!email.isDeleted && email.isRestored ? 'restored' : null)
                const isDeleted = badgeType === 'deleted'
                const isArchived = badgeType === 'archived'
                return (
                  <div key={email.id}
                    onClick={() => setPreviewId(isPreviewed ? null : email.id)}
                    className={`flex items-start gap-2 px-2 py-2.5 cursor-pointer transition-colors relative group
                      ${isPreviewed
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : isSelected
                          ? 'bg-blue-50/60'
                          : isArchived
                            ? 'bg-gray-50/60 hover:bg-gray-100/60'
                          : isDeleted
                            ? 'bg-red-50/30 hover:bg-red-50/50'
                            : 'hover:bg-gray-50'
                      }`}>
                    {/* Checkbox */}
                    <div className="shrink-0 pt-0.5" onClick={e => { e.stopPropagation(); toggleSelect(email.id) }}>
                      {isSelected
                        ? <CheckSquare size={13} className="text-blue-600" />
                        : <Square size={13} className="text-gray-300 group-hover:text-gray-400" />}
                    </div>

                    {/* Contenuto riga */}
                    <div className="flex-1 min-w-0">
                      {/* Mittente + data */}
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate font-medium ${isDeleted || isArchived ? 'text-gray-400' : 'text-gray-800'}`}>
                          <Highlight text={email.senderName || email.senderEmail || '—'} query={search} />
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                          {formatDateShort(email.sentAt)}
                        </span>
                      </div>
                      {/* Oggetto */}
                      <p className={`text-xs truncate mb-1 ${isDeleted || isArchived ? 'text-gray-400' : 'text-gray-600'}`}>
                        <Highlight text={email.subject || '(nessun oggetto)'} query={search} />
                      </p>
                      {/* Badge + allegati */}
                      <div className="flex items-center gap-1.5">
                        <EmailBadges email={email} compact />
                        {email.hasAttachments && (
                          <Paperclip size={10} className="text-gray-300 shrink-0" />
                        )}
                        {email.hasAttachments && (
                          <div onClick={e => e.stopPropagation()}>
                            <AvShield emailId={email.id} hasAttachments={email.hasAttachments} avStatus={email.avStatus} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Paginazione */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-white shrink-0">
            <span className="text-[10px] text-gray-400">Pag. {page} di {totalPages}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                <ChevronLeft size={12} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── DIVISORE DRAGGABLE ── */}
      {previewId && (
        <div
          onMouseDown={onDividerMouseDown}
          style={{ width: '5px', cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 10 }}
        >
          <div style={{
            position: 'absolute', inset: '0 -3px',
            background: 'transparent',
          }}
            onMouseEnter={e => e.currentTarget.parentElement.style.background = '#93c5fd'}
            onMouseLeave={e => e.currentTarget.parentElement.style.background = '#e5e7eb'}
          />
          <div style={{ width: '100%', height: '100%', background: '#e5e7eb' }} />
        </div>
      )}
      <div className="flex-1 overflow-hidden bg-white">
        <EmailPreview emailId={previewId} onClose={() => setPreviewId(null)} branding={branding} />
      </div>

      {/* ── Modal conferma bulk ── */}
      {confirmBulk && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {confirmBulk === 'delete'
                ? `Elimina ${selected.length} email`
                : `Ripristina ${selected.length} email`}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {confirmBulk === 'delete'
                ? "Le email verranno rimosse dall'IMAP e marchiate come eliminate. L'archivio rimane immutabile."
                : 'Ogni email verrà reinserita nell\'IMAP con la sua data originale.'}
            </p>
            {confirmBulk === 'restore' && (
              <input value={restoreTarget} onChange={e => setRestoreTarget(e.target.value)}
                placeholder="Email destinazione (es. office@k2tech.it)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
            )}
            <div className="flex gap-2">
              <button
                onClick={confirmBulk === 'delete' ? handleDeleteSelected : handleRestoreSelected}
                disabled={bulkLoading || (confirmBulk === 'restore' && !restoreTarget)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 transition-colors
                  ${confirmBulk === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {bulkLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : confirmBulk === 'delete' ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                Conferma
              </button>
              <button onClick={() => setConfirmBulk(null)} disabled={bulkLoading}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
