import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { clientLabel } from '../utils/clientLabel'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import {
  ShieldAlert, ShieldCheck, Trash2, Loader2, Mail, ChevronLeft, ChevronRight,
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
  // Selezione cliente/casella ricordata in sessione: tornando dallo spam (es. dopo
  // "Torna all'archivio") la casella resta selezionata senza doverla riscegliere.
  const [selectedClient, setSelectedClient] = useState(() => sessionStorage.getItem('mh_spam_client') || null)
  const [mailboxes, setMailboxes] = useState([])
  const [selectedMailbox, setSelectedMailbox] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('mh_spam_mailbox') || 'null') } catch { return null }
  })
  const [emails, setEmails] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  // La soglia della VISTA persiste per l'utente (localStorage): resta finché non
  // la cambia lui, senza dover premere "Salva soglia (globale)".
  const [threshold, setThreshold] = useState(() => {
    const v = localStorage.getItem('mh_spam_threshold')
    return v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : 5
  })
  const [autoscore, setAutoscore] = useState(true)
  const [source, setSource] = useState('origin')
  const [showSettings, setShowSettings] = useState(false)
  const [selected, setSelected] = useState([])
  const [selectAllMatching, setSelectAllMatching] = useState(false) // tutte le pagine, non solo le 50 visibili
  const [confirmDel, setConfirmDel] = useState(null) // { type:'single'|'bulk'|'all', id?, count }
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  // Whitelist mittenti/domini non-spam
  const [showWhitelist, setShowWhitelist] = useState(false)
  const [whitelist, setWhitelist] = useState([])

  useEffect(() => { if (threshold != null && !isNaN(threshold)) localStorage.setItem('mh_spam_threshold', String(threshold)) }, [threshold])

  // Persiste la selezione in sessione
  useEffect(() => {
    if (selectedClient) sessionStorage.setItem('mh_spam_client', selectedClient)
    else sessionStorage.removeItem('mh_spam_client')
  }, [selectedClient])
  useEffect(() => {
    if (selectedMailbox) sessionStorage.setItem('mh_spam_mailbox', JSON.stringify(selectedMailbox))
    else sessionStorage.removeItem('mh_spam_mailbox')
  }, [selectedMailbox])

  useEffect(() => {
    if (user?.role === 'superadmin' || user?.role === 'admin') {
      api.get('/admin/clients').then(r => setClients(r.data)).catch(() => {})
    }
    api.get('/spam/settings').then(r => {
      // usa il globale solo se l'utente non ha una sua soglia salvata
      if (localStorage.getItem('mh_spam_threshold') == null) setThreshold(r.data.threshold)
      setAutoscore(r.data.autoscore !== false)
    }).catch(() => {})
    loadWhitelist()
  }, [user])

  const loadWhitelist = () => api.get('/spam/whitelist').then(r => setWhitelist(r.data.items || [])).catch(() => {})

  const addToWhitelist = async (mode) => {
    if (!selected.length && !selectAllMatching) return
    try {
      // Per "tutte le pagine" prendiamo comunque gli id visibili (i mittenti unici bastano)
      const ids = selectAllMatching ? emails.map(e => e.email_id) : selected
      const r = await api.post('/spam/whitelist', { email_ids: ids, mode })
      setSelected([]); setSelectAllMatching(false)
      await loadWhitelist(); fetchSpam()
      setMsg(`${r.data.added} ${mode === 'domain' ? 'domini' : 'mittenti'} aggiunti alla whitelist`)
      setTimeout(() => setMsg(''), 3500)
    } catch (e) { setError(e.response?.data?.error || 'Errore whitelist') }
  }

  const removeWhitelist = async (id) => {
    try { await api.delete(`/spam/whitelist/${id}`); await loadWhitelist(); fetchSpam() }
    catch { setError('Errore rimozione') }
  }

  useEffect(() => {
    if (user?.role === 'superadmin' && selectedClient) {
      api.get('/emails/mailboxes/list').then(r => {
        const list = r.data.filter(m => m.client_id == selectedClient)
        setMailboxes(list)
        // Mantieni la casella selezionata se è ancora tra quelle del cliente
        // (ripristino da sessione); altrimenti azzera (cambio cliente).
        setSelectedMailbox(prev => (prev && list.some(m => m.id === prev.id)) ? prev : null)
      }).catch(() => {})
    } else if (user?.role !== 'superadmin') {
      api.get('/emails/mailboxes/list').then(r => {
        setMailboxes(r.data)
        setSelectedMailbox(prev => (prev && r.data.some(m => m.id === prev.id)) ? prev : (r.data.length === 1 ? r.data[0] : null))
      }).catch(() => {})
    }
  }, [selectedClient, user])

  const fetchSpam = useCallback(async () => {
    if (!selectedMailbox) return
    setLoading(true)
    try {
      const res = await api.get('/spam', {
        params: { mailbox_id: selectedMailbox.id, threshold, page, limit: 50, source }
      })
      setEmails(res.data.items || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch { setEmails([]) }
    finally { setLoading(false) }
  }, [selectedMailbox, threshold, page, source])

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

  const toggleAutoscore = async () => {
    const next = !autoscore
    setAutoscore(next)
    try { await api.post('/spam/settings', { autoscore: next }); setMsg(`Scoring automatico ${next ? 'attivato' : 'disattivato'}`); setTimeout(() => setMsg(''), 2500) }
    catch (err) { setAutoscore(!next); setError(err.response?.data?.error || 'Errore') }
  }

  const handleSaveThreshold = async () => {
    try {
      await api.post('/spam/settings', { threshold })
      setShowSettings(false)
      setMsg(`Soglia aggiornata a ${threshold}`)
      setTimeout(() => { setMsg(''); fetchSpam() }, 1000)
    } catch { setError('Errore salvataggio') }
  }

  // Reset selezione quando cambiano i criteri (casella/soglia/sorgente)
  useEffect(() => { setSelected([]); setSelectAllMatching(false); setPage(1) }, [selectedMailbox, threshold, source])

  // I pulsanti aprono la conferma; l'eliminazione vera avviene in doDelete()
  const handleDelete = (emailId) => setConfirmDel({ type: 'single', id: emailId })
  const handleDeleteSelected = () => {
    if (selectAllMatching) setConfirmDel({ type: 'all', count: total })
    else if (selected.length) setConfirmDel({ type: 'bulk', count: selected.length })
  }

  const doDelete = async () => {
    const c = confirmDel
    if (!c) return
    setConfirmDel(null); setDeleting(true); setError('')
    try {
      if (c.type === 'single') {
        await api.delete(`/spam/${c.id}`)
        setEmails(e => e.filter(x => x.email_id !== c.id))
        setSelected(s => s.filter(x => x !== c.id))
        setMsg('Email eliminata definitivamente')
      } else if (c.type === 'all') {
        // Tutte le email spam della casella sopra soglia, su TUTTE le pagine
        const r = await api.post('/spam/delete-bulk', { mailbox_id: selectedMailbox.id, threshold, source, all: true })
        setSelected([]); setSelectAllMatching(false); setPage(1)
        setMsg(`${r.data.deleted} email eliminate definitivamente${r.data.held ? ` · ${r.data.held} in Legal Hold saltate` : ''}`)
        fetchSpam()
      } else {
        // Blocco di id selezionati — una sola richiesta invece di N
        const r = await api.post('/spam/delete-bulk', { ids: selected })
        setEmails(e => e.filter(x => !selected.includes(x.email_id)))
        setSelected([])
        setMsg(`${r.data.deleted} email eliminate definitivamente${r.data.held ? ` · ${r.data.held} in Legal Hold saltate` : ''}`)
      }
      setTimeout(() => setMsg(''), 4000)
    } catch (err) { setError(err.response?.data?.error || 'Errore eliminazione') }
    finally { setDeleting(false) }
  }

  const toggleSelect = (id) => { setSelectAllMatching(false); setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]) }
  const toggleAll = () => { setSelectAllMatching(false); setSelected(selected.length === emails.length ? [] : emails.map(e => e.email_id)) }
  const allOnPageSelected = emails.length > 0 && (selectAllMatching || selected.length === emails.length)

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
                {clients.map(c => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
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
              {user?.role === 'superadmin' && (
                <div className="pt-2 mt-1 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Scoring automatico</p>
                    <p className="text-[11px] text-gray-400">Rspamd valuta le nuove email da solo</p>
                  </div>
                  <button onClick={toggleAutoscore}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${autoscore ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${autoscore ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
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
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg" title="Quale punteggio usare per il filtro">
                {[['origin', 'Origine'], ['mh', 'MailHaven']].map(([id, label]) => (
                  <button key={id} onClick={() => { setSource(id); setPage(1) }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${source === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                ))}
              </div>
              {(selected.length > 0 || selectAllMatching) && (
                <>
                  <button onClick={handleDeleteSelected} disabled={deleting}
                    className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Elimina {selectAllMatching ? total : selected.length} {(selectAllMatching ? total : selected.length) === 1 ? 'selezionata' : 'selezionate'}
                  </button>
                  <button onClick={() => addToWhitelist('sender')} title="Segna i mittenti come NON spam"
                    className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50">
                    <ShieldCheck size={14} /> Whitelist mittente
                  </button>
                  <button onClick={() => addToWhitelist('domain')} title="Segna i domini come NON spam"
                    className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50">
                    <ShieldCheck size={14} /> Whitelist dominio
                  </button>
                </>
              )}
              <button onClick={() => { setShowWhitelist(v => !v); loadWhitelist() }}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${showWhitelist ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <ShieldCheck size={14} /> Whitelist ({whitelist.length})
              </button>
              {selectedMailbox && (
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {analyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Analizza casella
                </button>
              )}
            </div>
          </div>

          {/* Pannello whitelist */}
          {showWhitelist && (
            <div className="mb-4 bg-white border border-green-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-green-100 bg-green-50/50">
                <h3 className="text-sm font-semibold text-gray-900">Whitelist — mittenti e domini NON spam</h3>
                <p className="text-xs text-gray-500 mt-0.5">Le email da questi mittenti/domini non compaiono più tra lo spam. Selezionane alcune spam e usa "Whitelist mittente/dominio" per aggiungerle.</p>
              </div>
              {whitelist.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">Nessuna voce in whitelist</p>
              ) : (
                <div className="flex flex-wrap gap-2 p-3">
                  {whitelist.map(w => (
                    <span key={w.id} className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-800 px-2 py-1 rounded-full">
                      <span className="text-green-500">{w.kind === 'domain' ? '@' : '✉'}</span>
                      {w.value}
                      <button onClick={() => removeWhitelist(w.id)} className="text-green-400 hover:text-red-500" title="Rimuovi">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

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
              {/* Banner "seleziona tutte le pagine": appare quando tutte le email
                  visibili sono selezionate ma ce ne sono altre nelle pagine successive. */}
              {allOnPageSelected && total > emails.length && (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-sm">
                  {selectAllMatching ? (
                    <>
                      <span className="text-amber-800">Tutte le <strong>{total}</strong> email spam di questa casella sono selezionate.</span>
                      <button onClick={() => { setSelectAllMatching(false); setSelected([]) }} className="text-blue-600 font-medium hover:underline">Annulla selezione</button>
                    </>
                  ) : (
                    <>
                      <span className="text-amber-800">Selezionate le {emails.length} di questa pagina.</span>
                      <button onClick={() => { setSelectAllMatching(true); setSelected(emails.map(e => e.email_id)) }} className="text-blue-600 font-medium hover:underline">Seleziona tutte le {total}</button>
                    </>
                  )}
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                        {allOnPageSelected
                          ? <CheckSquare size={16} className="text-blue-600" />
                          : <Square size={16} />}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{source === 'mh' ? 'MailHaven' : 'Origine'}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">MailHaven</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Oggetto</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mittente</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-16">
                      <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
                    </td></tr>
                  ) : emails.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-16">
                      <ShieldAlert size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Nessuna email spam trovata</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Clicca "Analizza casella" per scansionare le email archiviate
                      </p>
                    </td></tr>
                  ) : emails.map(email => (
                    <tr key={email.email_id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${(selectAllMatching || selected.includes(email.email_id)) ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(email.email_id) }}>
                        {(selectAllMatching || selected.includes(email.email_id))
                          ? <CheckSquare size={16} className="text-red-500" />
                          : <Square size={16} className="text-gray-300" />}
                      </td>
                      <td className="px-4 py-3" onClick={() => navigate(`/email/${email.email_id}`)}>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${scoreColor(email.score)}`}>
                          <AlertTriangle size={10} />
                          {email.score}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={() => navigate(`/email/${email.email_id}`)}>
                        {email.mh_spam_score != null ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${scoreColor(email.mh_spam_score)}`} title={email.mh_spam_action || ''}>
                            {email.mh_spam_score}{email.mh_spam_action === 'reject' ? ' ⛔' : ''}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
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

      {/* Conferma eliminazione — l'eliminazione dallo spam è DEFINITIVA */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {confirmDel.type === 'single' ? 'Eliminare questa email?' : `Eliminare ${confirmDel.count} email?`}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  L'eliminazione dallo spam è <strong>definitiva</strong>: le email vengono rimosse
                  dall'archivio e non sono più recuperabili. Le email in Legal Hold non vengono toccate.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annulla</button>
              <button onClick={doDelete} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
