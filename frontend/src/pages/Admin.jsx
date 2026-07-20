import React, { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { Users, Building2, Inbox, Plus, Check, Loader2, MoreVertical, Pencil, Trash2, RefreshCw, ChevronDown, Search, X, Activity, AlertCircle, CheckCircle2, Clock, Eye, EyeOff, Zap, Pause, Play, ToggleLeft, ToggleRight, Store, KeyRound, Download, Upload } from 'lucide-react'

const BASE_TABS = ['Clienti', 'Utenti', 'Caselle Email', 'Storage']

// ═══════════════════════════════════════════════════════════════
// StorageTab — embedded in Gestione
// ═══════════════════════════════════════════════════════════════
function StorageTab({ user }) {
  const [clients, setClients] = React.useState([])
  const [mailboxes, setMailboxes] = React.useState([])
  const [vm, setVm] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [activeTab, setActiveTab] = React.useState('mailboxes')

  const role = user?.role || 'user'
  const isSuperadmin = role === 'superadmin'
  const isAdmin = role === 'admin' || isSuperadmin

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const BarUsage = ({ percent, color = 'blue' }) => {
    const colors = { blue: 'bg-blue-500', green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }
    const p = Math.min(percent || 0, 100)
    const c = p > 85 ? 'red' : p > 65 ? 'amber' : color
    return (
      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
        <div className={`h-1.5 rounded-full transition-all ${colors[c]}`} style={{ width: `${p}%` }} />
      </div>
    )
  }

  const load = async () => {
    setLoading(true)
    try {
      if (isAdmin) {
        const [cRes, mRes] = await Promise.all([
          api.get('/admin/storage/clients'),
          api.get('/admin/storage/mailboxes'),
        ])
        setClients(cRes.data)
        setMailboxes(mRes.data)
      } else {
        const mRes = await api.get('/admin/storage/mailboxes')
        setMailboxes(mRes.data)
      }
      if (isSuperadmin) {
        const vRes = await api.get('/admin/storage/vm')
        setVm(vRes.data)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  React.useEffect(() => { load() }, [])

  const totalOriginal = mailboxes.reduce((s, m) => s + m.originalBytes, 0)
  const totalCompressed = mailboxes.reduce((s, m) => s + m.compressedBytes, 0)
  const totalEmails = mailboxes.reduce((s, m) => s + m.emailCount, 0)
  const totalSaved = totalOriginal - totalCompressed
  const totalRatio = totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Cards sommario */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Email totali', value: totalEmails.toLocaleString() },
          { label: 'Spazio originale', value: formatBytes(totalOriginal) },
          { label: 'Spazio compresso', value: formatBytes(totalCompressed), sub: `${totalRatio}% risparmiato` },
          { label: 'Spazio risparmiato', value: formatBytes(totalSaved) },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-lg font-semibold text-gray-900">{c.value}</p>
            {c.sub && <p className="text-xs text-green-600">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* VM Stats — solo superadmin */}
      {isSuperadmin && vm && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Spazio VM</h3>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Superadmin</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Disco sistema</span>
                <span className="font-medium">{formatBytes(vm.vm.usedBytes)} / {formatBytes(vm.vm.totalBytes)}</span>
              </div>
              <BarUsage percent={vm.vm.usedPercent} />
              <p className="text-xs text-gray-400 mt-1">{formatBytes(vm.vm.availBytes)} disponibili</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Volumi Docker</span>
                <span className="font-medium">{formatBytes(vm.docker.dbBytes)}</span>
              </div>
              <BarUsage percent={vm.vm.totalBytes > 0 ? Math.round((vm.docker.dbBytes / vm.vm.totalBytes) * 100) : 0} color="purple" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs per/cliente e per/casella */}
      {isAdmin && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button onClick={() => setActiveTab('clients')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors font-medium ${activeTab === 'clients' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Per cliente
          </button>
          <button onClick={() => setActiveTab('mailboxes')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors font-medium ${activeTab === 'mailboxes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Per casella
          </button>
        </div>
      )}

      {/* Tabella clienti */}
      {isAdmin && activeTab === 'clients' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Caselle</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Originale</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compresso</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-40">Quota</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Risparmio</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{c.mailboxCount}{c.maxMailboxes != null ? ` / ${c.maxMailboxes}` : ''}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{c.emailCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBytes(c.originalBytes)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium">{formatBytes(c.compressedBytes)}</td>
                  <td className="px-4 py-3">
                    {c.quotaBytes != null ? (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className={c.overQuota ? 'font-semibold text-red-600' : 'text-gray-500'}>{c.usagePercent ?? 0}%{c.overQuota ? ' • superata' : ''}</span>
                          <span className="text-gray-400">{formatBytes(c.compressedBytes)} / {formatBytes(c.quotaBytes)}</span>
                        </div>
                        <BarUsage percent={c.usagePercent ?? 100} />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">∞ illimitato</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-600">{c.compressionRatio}%</span>
                      <BarUsage percent={c.compressionRatio} color="green" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-4 py-3 text-sm font-bold">Totale</td>
                <td className="px-4 py-3 text-right text-sm font-bold">{clients.reduce((s,c)=>s+c.mailboxCount,0)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold">{totalEmails.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm font-bold">{formatBytes(totalOriginal)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">{formatBytes(totalCompressed)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-sm font-bold text-green-600">{totalRatio}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tabella caselle */}
      {activeTab === 'mailboxes' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Casella</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>}
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Originale</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compresso</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Risparmio</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map(m => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{m.email}</p>
                    {m.displayName && m.displayName !== m.email && <p className="text-xs text-gray-400">{m.displayName}</p>}
                  </td>
                  {isAdmin && <td className="px-4 py-3 text-sm text-gray-500">{m.clientName}</td>}
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{m.emailCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBytes(m.originalBytes)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium">{formatBytes(m.compressedBytes)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-600">{m.compressionRatio}%</span>
                      <BarUsage percent={m.compressionRatio} color="green" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
          <RefreshCw size={14} /> Aggiorna
        </button>
      </div>
    </div>
  )
}

export default function Admin() {
  const initTab=()=>{const p=new URLSearchParams(window.location.search);if(p.get("oauth_success")||p.get("tab")==="mailboxes")return 2;return 0}
  const [tab,setTab]=useState(initTab)
  const [gToast,setGToast]=useState(null)

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search)
    const s=p.get("oauth_success");const e=p.get("oauth_error")
    if(s){setGToast({type:"success",msg:"Casella "+s+" collegata con successo!"});window.history.replaceState({},"",window.location.pathname);setTimeout(()=>setGToast(null),6000)}
    else if(e){setGToast({type:"error",msg:"Errore OAuth: "+e});window.history.replaceState({},"",window.location.pathname);setTimeout(()=>setGToast(null),8000)}
  },[])
  const { user } = useAuth()
  const { branding } = useBranding()
  const tabs = user?.role === 'superadmin' ? [...BASE_TABS, 'Rivenditori'] : BASE_TABS

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Gestione</h1>
        <p className="text-sm text-gray-500 mt-0.5">Clienti, utenti e caselle email</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit mb-6 overflow-x-auto">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 sm:flex-none justify-center ${
              tab === i ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {i === 0 && <Building2 size={14} />}
            {i === 1 && <Users size={14} />}
            {i === 2 && <Inbox size={14} />}
            {i === 4 && <Store size={14} />}
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <ClientsTab branding={branding} user={user} />}
      {tab === 1 && <UsersTab branding={branding} user={user} />}
      {tab === 2 && <MailboxesTab branding={branding} user={user} />}
      {tab === 3 && <StorageTab user={user} />}
      {tab === 4 && user?.role === 'superadmin' && <ResellersTab branding={branding} user={user} />}
      {gToast&&(<div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-sm font-semibold ${gToast.type==="success"?"bg-green-600 text-white":"bg-red-600 text-white"}`}>{gToast.type==="success"?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}{gToast.msg}<button onClick={()=>setGToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14}/></button></div>)}
    </div>
  )
}


// ── Password strength helpers ──
const generatePassword = () => {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?'
  const all = upper + lower + numbers + special
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
  ]
  for (let i = 4; i < 16; i++) pwd.push(all[Math.floor(Math.random() * all.length)])
  return pwd.sort(() => Math.random() - 0.5).join('')
}

const getPasswordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Debole', color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'Media', color: 'bg-amber-500' }
  return { score, label: 'Forte', color: 'bg-green-500' }
}

const validatePassword = (pwd) => {
  const errors = []
  if (!pwd) return errors
  if (pwd.length < 8) errors.push('Minimo 8 caratteri')
  if (!/[A-Z]/.test(pwd)) errors.push('Almeno una maiuscola')
  if (!/[0-9]/.test(pwd)) errors.push('Almeno un numero')
  if (!/[^A-Za-z0-9]/.test(pwd)) errors.push('Almeno un carattere speciale')
  return errors
}

function UserPicker({ users, selected, onChange }) {
  const [search, setSearch] = useState('')
  const filtered = users.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
        <Search size={13} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca utente..."
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
        />
        {selected.length > 0 && (
          <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">
            {selected.length}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Nessun utente trovato</p>
        )}
        {filtered.map(u => (
          <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="checkbox"
              checked={selected.includes(u.id)}
              onChange={e => onChange(prev =>
                e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
              )}
              className="rounded text-blue-600 shrink-0"
            />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                {(u.full_name || u.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-gray-400 truncate">{u.email} · <span className="capitalize">{u.role}</span></p>
              </div>
            </div>
            {selected.includes(u.id) && <Check size={14} className="text-blue-500 shrink-0" />}
          </label>
        ))}
      </div>
    </div>
  )
}

function ActionMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px', cursor: 'pointer', background: 'none', border: 'none', borderRadius: '6px' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <MoreVertical size={16} color="#9ca3af" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            zIndex: 999,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            minWidth: '160px',
            padding: '4px',
          }}>
            <button
              onClick={() => { onEdit(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#374151', borderRadius: '8px' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Pencil size={14} color="#9ca3af" /> Modifica
            </button>
            <button
              onClick={() => { onDelete(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#dc2626', borderRadius: '8px' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Trash2 size={14} /> Elimina
            </button>
          </div>
        </>
      )}
    </div>
  )
}


function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: 'min(92vh, 800px)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  )
}

function DotDot() {
  const [dots, setDots] = React.useState('.')
  React.useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 400)
    return () => clearInterval(t)
  }, [])
  return <span className="inline-block w-5 text-left">{dots}</span>
}

function ConfirmDelete({ name, onConfirm, onCancel }) {
  return (
    <Modal title="Conferma eliminazione" onClose={onCancel}>
      <p className="text-sm text-gray-600 mb-6">
        Sei sicuro di voler eliminare <strong>{name}</strong>? Questa azione non può essere annullata.
      </p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          Annulla
        </button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
          Elimina
        </button>
      </div>
    </Modal>
  )
}

// ---- IMPORT CLIENTI DA ITFLOW (solo superadmin) ----
function ItflowImportModal({ onClose, onImported, branding }) {
  const [cfg, setCfg] = useState({ url: '', api_key: '' })
  const [cfgState, setCfgState] = useState({ configured: false, api_key_set: false, loaded: false })
  const [items, setItems] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  const loadClients = async () => {
    setBusy(true); setErr(''); setDone(null)
    try {
      const r = await api.get('/itflow/clients')
      setItems(r.data.items); setSel(new Set())
    } catch (e) { setErr(e.response?.data?.error || 'Errore caricamento clienti ITFlow'); setItems(null) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    api.get('/itflow/config').then(r => {
      setCfgState({ ...r.data, loaded: true })
      setCfg(c => ({ ...c, url: r.data.url || '' }))
      if (r.data.configured) loadClients()
    }).catch(() => setCfgState(s => ({ ...s, loaded: true })))
  }, [])

  const saveCfg = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('/itflow/config', { url: cfg.url, api_key: cfg.api_key })
      setCfgState(s => ({ ...s, configured: true, api_key_set: true }))
      setCfg(c => ({ ...c, api_key: '' }))
      await loadClients()
    } catch (e) { setErr(e.response?.data?.error || 'Errore salvataggio configurazione') }
    finally { setBusy(false) }
  }

  const toggle = (id) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const importables = (items || []).filter(i => !i.imported)

  const doImport = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.post('/itflow/import', { ids: [...sel] })
      setDone(r.data)
      await loadClients()
      onImported?.()
    } catch (e) { setErr(e.response?.data?.error || 'Errore durante l\'import') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Importa clienti da ITFlow</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div className="space-y-2">
            <input value={cfg.url} onChange={e => setCfg({ ...cfg, url: e.target.value })}
              placeholder="URL ITFlow — es. https://itflow.k2tech.it"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <input type="password" value={cfg.api_key} onChange={e => setCfg({ ...cfg, api_key: e.target.value })}
                placeholder={cfgState.api_key_set ? 'API key salvata — lascia vuoto per non cambiarla' : 'API key ITFlow'}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <button onClick={saveCfg} disabled={busy || !cfg.url}
                className="px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {cfgState.configured ? 'Salva e ricarica' : 'Collega'}
              </button>
            </div>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          {done && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              Import completato: {done.imported} importati, {done.linked} collegati a esistenti, {done.skipped} saltati.
            </p>
          )}

          {busy && !items && <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-gray-400" /></div>}

          {items && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg">
                <span className="text-xs text-gray-500">{items.length} clienti su ITFlow — {importables.length} da importare</span>
                <div className="flex gap-3">
                  <button onClick={() => setSel(new Set(importables.map(i => i.itflow_id)))} className="text-xs text-blue-600 hover:underline">Seleziona tutti</button>
                  <button onClick={() => setSel(new Set())} className="text-xs text-gray-500 hover:underline">Nessuno</button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {items.map(i => (
                  <label key={i.itflow_id} className={`flex items-center gap-3 px-3 py-2 text-sm ${i.imported ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input type="checkbox" disabled={i.imported} checked={i.imported || sel.has(i.itflow_id)} onChange={() => toggle(i.itflow_id)} />
                    <span className="flex-1 text-gray-800">{i.name}</span>
                    {i.imported && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={12} /> già importato</span>}
                    {!i.imported && i.name_match && <span className="text-xs text-amber-600">omonimo esistente → verrà collegato</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Chiudi</button>
          <button onClick={doImport} disabled={busy || sel.size === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: branding.primary_color || '#2563eb' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Importa selezionati ({sel.size})
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- CLIENTS ----
function ClientsTab({ branding, user }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [form, setForm] = useState({ name: '', company: '', active: true, quota_gb: '', max_mailboxes: '', max_users: '' })
  const [saving, setSaving] = useState(false)
  const [showItflow, setShowItflow] = useState(false)
  const GB = 1024 * 1024 * 1024

  const load = () => {
    setLoading(true)
    api.get('/admin/clients').then(r => setClients(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm({ name: '', company: '', active: true, quota_gb: '', max_mailboxes: '', max_users: '' }); setEditItem(null); setShowForm(true) }
  const openEdit = (c) => {
    setForm({
      name: c.name, company: c.company || '', active: c.active,
      quota_gb: c.quota_bytes != null ? +(c.quota_bytes / GB).toFixed(2) : '',
      max_mailboxes: c.max_mailboxes ?? '',
      max_users: c.max_users ?? '',
    })
    setEditItem(c); setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      name: form.name, company: form.company, active: form.active,
      quota_bytes: form.quota_gb === '' || form.quota_gb === null ? null : Math.round(Number(form.quota_gb) * GB),
      max_mailboxes: form.max_mailboxes === '' ? null : Number(form.max_mailboxes),
      max_users: form.max_users === '' ? null : Number(form.max_users),
    }
    try {
      if (editItem) await api.put(`/admin/clients/${editItem.id}`, payload)
      else await api.post('/admin/clients', payload)
      setShowForm(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await api.delete(`/admin/clients/${deleteItem.id}`) } catch { }
    setDeleteItem(null); load()
  }

  return (
    <>
      {showItflow && <ItflowImportModal onClose={() => setShowItflow(false)} onImported={load} branding={branding} />}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{user.role === 'reseller' ? 'Aziende' : 'Clienti'} ({clients.length})</h2>
          {(user.role === 'superadmin' || user.role === 'reseller') && (
            <div className="flex items-center gap-2">
              {user.role === 'superadmin' && (
                <button onClick={() => setShowItflow(true)} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Download size={14} /> Importa da ITFlow
                </button>
              )}
              <button onClick={openNew} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white"
                style={{ background: branding.primary_color || '#2563eb' }}>
                <Plus size={14} /> {user.role === 'reseller' ? 'Nuova azienda' : 'Nuovo cliente'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16">
            <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nessun cliente</p>
          </div>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Azienda</th>
              {user.role === 'superadmin' && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rivenditore</th>}
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
              <th className="px-6 py-3 w-12"></th>
            </tr></thead>
            <tbody>{clients.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-6 py-3.5">
  <p className="text-sm font-medium text-gray-900">
    {c.name}{c.company ? ` (${c.company})` : ''}
  </p>
  <p className="text-xs text-gray-500 sm:hidden">{c.active ? 'Attivo' : 'Disabilitato'}</p>
</td>
<td className="hidden sm:table-cell px-6 py-3.5 text-sm text-gray-600">{c.company || '�'}</td>
                {user.role === 'superadmin' && <td className="hidden md:table-cell px-6 py-3.5 text-sm text-gray-600">{c.reseller_name || 'Diretto'}</td>}
                <td className="hidden sm:table-cell px-6 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.active ? 'Attivo' : 'Disabilitato'}
                  </span>
                </td>
                <td className="px-4 py-3.5"><ActionMenu onEdit={() => openEdit(c)} onDelete={() => setDeleteItem(c)} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={editItem ? 'Modifica cliente' : 'Nuovo cliente'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome referente *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="Mario Rossi" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Azienda</label>
              <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="Acme Srl" />
            </div>
            {editItem && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600">Stato</label>
                <button onClick={() => setForm({ ...form, active: !form.active })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-gray-500">{form.active ? 'Attivo' : 'Disabilitato'}</span>
              </div>
            )}
            {(user.role === 'superadmin' || user.role === 'reseller') && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Quote</p>
                <p className="text-xs text-gray-400 mb-3">Lascia vuoto per illimitato. Al superamento si blocca la creazione di nuove risorse, mai l'archiviazione.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Spazio (GB)</label>
                    <input type="number" min="0" step="0.5" value={form.quota_gb} onChange={e => setForm({ ...form, quota_gb: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Caselle max</label>
                    <input type="number" min="0" step="1" value={form.max_mailboxes} onChange={e => setForm({ ...form, max_mailboxes: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Utenti max</label>
                    <input type="number" min="0" step="1" value={form.max_users} onChange={e => setForm({ ...form, max_users: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" />
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={!form.name || saving}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editItem ? 'Salva modifiche' : 'Crea cliente'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button>
            </div>
          </div>
        </Modal>
      )}
      {deleteItem && <ConfirmDelete name={deleteItem.name} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
    </>
  )
}

// ---- USERS ----
function UsersTab({ branding, user }) {
  const [users, setUsers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'user', client_id: '', active: true })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = async () => {
    setLoading(true)
    const [u, c] = await Promise.all([api.get('/admin/users'), api.get('/admin/clients')])
    setUsers(u.data); setClients(c.data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm({ email: '', password: '', full_name: '', role: 'user', client_id: '', active: true }); setEditItem(null); setShowForm(true) }
  const openEdit = (u) => { setForm({ email: u.email, password: '', full_name: u.full_name || '', role: u.role, client_id: u.client_id || '', active: u.active }); setEditItem(u); setShowForm(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editItem) await api.put(`/admin/users/${editItem.id}`, { ...form, client_id: form.client_id || null })
      else await api.post('/admin/users', { ...form, client_id: form.client_id || null })
      setShowForm(false); load()
    } catch (err) { alert(err.response?.data?.error || 'Errore') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/users/${deleteItem.id}`)
      setDeleteError(null)
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'Errore durante l\'eliminazione dell\'utente')
    }
    setDeleteItem(null); load()
  }

  const roleLabel = { superadmin: 'Super Admin', admin: 'Admin', user: 'Utente' }
  const roleColor = { superadmin: 'bg-purple-100 text-purple-700', admin: 'bg-blue-100 text-blue-700', user: 'bg-gray-100 text-gray-600' }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-xl">
          <h2 className="font-semibold text-gray-900">Utenti ({users.length})</h2>
          <button onClick={openNew} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ background: branding.primary_color || '#2563eb' }}>
            <Plus size={14} /> Nuovo utente
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Utente</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ruolo</th>
              <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Azienda</th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ultimo accesso</th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
              <th className="px-6 py-3 w-12"></th>
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-6 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{u.full_name || '—'}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-400 sm:hidden mt-0.5">{u.active ? 'Attivo' : 'Disabilitato'}</p>
                </td>
                <td className="px-6 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColor[u.role]}`}>{roleLabel[u.role]}</span>
                </td>
                <td className="hidden md:table-cell px-6 py-3.5 text-sm text-gray-600">{u.client_name || '-'}</td>
                <td className="hidden lg:table-cell px-6 py-3.5 text-sm text-gray-600">{u.client_company || '-'}</td>
                <td className="hidden lg:table-cell px-6 py-3.5 text-sm text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleDateString('it-IT') : 'Mai'}</td>
                <td className="hidden sm:table-cell px-6 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.active ? 'Attivo' : 'Disabilitato'}
                  </span>
                </td>
                <td className="px-4 py-3.5"><ActionMenu onEdit={() => openEdit(u)} onDelete={() => setDeleteItem(u)} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={editItem ? 'Modifica utente' : 'Nuovo utente'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome completo</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="Mario Rossi" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                disabled={!!editItem}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {editItem ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password *'}
              </label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-9 focus:outline-none focus:ring-2"
                    placeholder={editItem ? '••••••••' : 'Min 8 caratteri'}
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button type="button"
                  onClick={() => { const p = generatePassword(); setForm({ ...form, password: p }); setShowPassword(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 shrink-0">
                  <Zap size={12} /> Genera
                </button>
              </div>
              {form.password && (() => {
                const strength = getPasswordStrength(form.password)
                const errors = validatePassword(form.password)
                return (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-1.5 rounded-full transition-all ${strength.color}`}
                          style={{ width: `${(strength.score / 5) * 100}%` }} />
                      </div>
                      <span className={`text-xs font-medium ${
                        strength.score <= 1 ? 'text-red-500' :
                        strength.score <= 3 ? 'text-amber-500' : 'text-green-600'
                      }`}>{strength.label}</span>
                    </div>
                    {errors.length > 0 && (
                      <p className="text-xs text-red-500">{errors.join(' · ')}</p>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Ruolo</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none">
                  {user.role === 'superadmin' && <><option value="superadmin">Super Admin</option><option value="admin">Admin</option></>}
                  {user.role === 'reseller' && <option value="admin">Admin</option>}
                  <option value="user">Utente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cliente</label>
                <select value={form.client_id} onChange={e => { setForm({ ...form, client_id: e.target.value }); loadClientUsers(e.target.value); setAssignedUsers([]); }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none">
                  <option value="">— Nessuno —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                </select>
              </div>
            </div>
            {editItem && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600">Stato</label>
                <button onClick={() => setForm({ ...form, active: !form.active })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-gray-500">{form.active ? 'Attivo' : 'Disabilitato'}</span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={(!editItem && (!form.email || !form.password)) || saving}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editItem ? 'Salva modifiche' : 'Crea utente'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button>
            </div>
          </div>
        </Modal>
      )}
      {deleteError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl shadow-lg px-4 py-3 max-w-sm">
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-800">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {deleteItem && <ConfirmDelete name={deleteItem.email} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
    </>
  )
}

function ImapAccordion({ form, setForm, editItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credenziali IMAP</span>
          {form.imap_password && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {!form.imap_password && editItem?.has_password && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Server IMAP</label>
              <input value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                placeholder="mail.dominio.it" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Porta</label>
              <input type="number" value={form.imap_port}
                onChange={e => setForm({ ...form, imap_port: parseInt(e.target.value) })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Username</label>
            <input value={form.imap_user} onChange={e => setForm({ ...form, imap_user: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
              placeholder="Di solito uguale all'email" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Password {editItem && <span className="text-gray-400">(lascia vuoto per non cambiare)</span>}
            </label>
            <input type="password" value={form.imap_password}
              onChange={e => setForm({ ...form, imap_password: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
              placeholder="••••••••" />
            <p className="text-xs text-gray-400 mt-0.5">🔒 Salvata cifrata con AES-256</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => { const tls = !form.imap_tls; setForm({ ...form, imap_tls: tls, imap_port: tls ? 993 : 143 }) }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.imap_tls ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.imap_tls ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs text-gray-600">SSL/TLS {form.imap_tls ? '(porta 993)' : '(porta 143)'}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setForm({ ...form, allow_insecure_tls: !form.allow_insecure_tls })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.allow_insecure_tls ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.allow_insecure_tls ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs text-gray-600">Certificato non sicuro</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- MAILBOXES ----
function MailboxesTab({ branding, user }) {
  const [mailboxes, setMailboxes] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncStatus, setSyncStatus] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deletingIds, setDeletingIds] = useState(new Set())
  const [deleteError, setDeleteError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({
    client_id: '', email: '', display_name: '',
    imap_host: '', imap_port: 993, imap_tls: true,
    imap_user: '', imap_password: '', allow_insecure_tls: false
  })
  const [clientUsers, setClientUsers] = useState([])
  const [assignedUsers, setAssignedUsers] = useState([])
  // Import in blocco di caselle
  const [showBulk, setShowBulk] = useState(false)
  const [bulkClient, setBulkClient] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  const load = async () => {
    setLoading(true)
    const [m, c] = await Promise.all([api.get('/admin/mailboxes'), api.get('/admin/clients')])
    setMailboxes(m.data); setClients(c.data); setLoading(false)
  }

  // Righe: email;password;host;porta  (separatore ; , o TAB — solo email è obbligatoria)
  const parseBulk = (text) => text.split(/\r?\n/)
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(line => {
      const p = line.split(/[;,\t]/).map(s => s.trim())
      return { email: p[0], password: p[1] || '', imap_host: p[2] || '', imap_port: p[3] || '' }
    })

  const bulkItems = parseBulk(bulkText)
  const bulkValid = bulkItems.filter(i => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email || ''))

  const handleBulkImport = async () => {
    if (!bulkClient || !bulkValid.length) return
    setBulkLoading(true); setBulkResult(null)
    try {
      const r = await api.post('/admin/mailboxes/bulk', { client_id: bulkClient, items: bulkItems })
      setBulkResult(r.data)
      await load()
    } catch (e) {
      setBulkResult({ error: e.response?.data?.error || 'Errore durante l\'import' })
    } finally { setBulkLoading(false) }
  }

  const loadClientUsers = async (clientId) => {
    if (!clientId) { setClientUsers([]); return }
    try {
      const res = await api.get(`/admin/users?client_id=${clientId}`)
      setClientUsers(res.data || [])
    } catch { setClientUsers([]) }
  }

  const loadAssignedUsers = async (mailboxId) => {
    if (!mailboxId) { setAssignedUsers([]); return }
    try {
      const res = await api.get(`/admin/mailboxes/${mailboxId}/users`)
      setAssignedUsers(res.data.map(u => u.user_id) || [])
    } catch { setAssignedUsers([]) }
  }

  const [oauthToast, setOauthToast] = useState(null) // { type: 'success'|'error', msg }

  useEffect(() => {
    load()
    loadSyncStatus()
    const interval = setInterval(loadSyncStatus, 5000)
    // Gestione ritorno callback OAuth
    const params = new URLSearchParams(window.location.search)
    const oauthSuccess = params.get('oauth_success')
    const oauthError = params.get('oauth_error')
    if (oauthSuccess) {
      setOauthToast({ type: 'success', msg: `Casella ${oauthSuccess} collegata via OAuth` })
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => setOauthToast(null), 5000)
    } else if (oauthError) {
      setOauthToast({ type: 'error', msg: `Errore OAuth: ${oauthError}` })
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => setOauthToast(null), 8000)
    }
    return () => clearInterval(interval)
  }, [])

  const loadSyncStatus = async () => {
    try {
      const res = await api.get('/admin/sync-status')
      const byMailbox = {}
      res.data.forEach(log => {
        if (!byMailbox[log.mailbox_id]) byMailbox[log.mailbox_id] = log
      })
      setSyncStatus(byMailbox)
    } catch {}
  }

  const defaultForm = () => ({
    client_id: '', email: '', display_name: '',
    imap_host: '', imap_port: 993, imap_tls: true,
    imap_user: '', imap_password: '', allow_insecure_tls: false
  })

  const openNew = () => { setForm(defaultForm()); setEditItem(null); setTestResult(null); setSaveError(''); setShowForm(true) }
  const openEdit = (m) => {
    setForm({
      client_id: m.client_id || '', email: m.email, display_name: m.display_name || '',
      imap_host: m.imap_host || '', imap_port: m.imap_port || 993,
      imap_tls: m.imap_tls !== false, imap_user: m.imap_user || m.email,
      imap_password: '', allow_insecure_tls: false
    })
    setEditItem(m); setTestResult(null); setSaveError(''); setShowForm(true)
    loadClientUsers(m.client_id)
    loadAssignedUsers(m.id)
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await api.post('/admin/mailboxes/test-imap', form)
      setTestResult({ success: true, message: res.data.message })
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || 'Connessione fallita' })
    } finally { setTesting(false) }
  }

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    try {
      let mailboxId
      if (editItem) {
        await api.put(`/admin/mailboxes/${editItem.id}`, form)
        mailboxId = editItem.id
      } else {
        const res = await api.post('/admin/mailboxes', form)
        mailboxId = res.data.id
      }
      // Salva utenti assegnati
      if (mailboxId && assignedUsers.length >= 0) {
        await api.post(`/admin/mailboxes/${mailboxId}/users`, { user_ids: assignedUsers })
      }
      setShowForm(false); load()
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    const id = deleteItem.id
    const email = deleteItem.email
    setDeleteItem(null)
    setDeleteError(null)
    setDeletingIds(prev => new Set([...prev, id]))
    try {
      await api.delete(`/admin/mailboxes/${id}`)
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'Errore durante l\'eliminazione')
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s })
      return
    }
    // Pulizia localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('mv_dashboard_state') || '{}')
      if (saved.selectedMailboxId === id) {
        delete saved.selectedMailboxId
        localStorage.setItem('mv_dashboard_state', JSON.stringify(saved))
      }
    } catch {}
    // Poll until mailbox disappears
    const poll = setInterval(async () => {
      try {
        const res = await api.get('/admin/mailboxes')
        const still = res.data.find(m => m.id === id)
        if (!still || still.status !== 'deleting') {
          clearInterval(poll)
          setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s })
          load()
        } else if (still.status === 'error_deleting') {
          clearInterval(poll)
          setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s })
          setDeleteError(`Errore nell'eliminazione di ${email}`)
          load()
        }
      } catch { /* ignore poll errors */ }
    }, 2000)
  }

  const handleToggleActive = async (m) => {
    try {
      const res = await api.patch(`/admin/mailboxes/${m.id}/toggle`)
      setMailboxes(prev => prev.map(mb => mb.id === m.id ? { ...mb, active: res.data.active } : mb))
    } catch { }
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await api.post('/admin/sync-oa-sources')
      setSyncMsg(res.data.message)
      load()
    } catch { setSyncMsg('Errore sincronizzazione') }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 4000) }
  }

  // Provider noti � autodetect host/porta/tls
  const KNOWN_PROVIDERS = {
    'tiscali.it':    { host: 'imap.tiscali.it',      port: 993, tls: true },
    'libero.it':     { host: 'imapmail.libero.it',    port: 993, tls: true },
    'virgilio.it':   { host: 'imap.virgilio.it',      port: 993, tls: true },
    'tin.it':        { host: 'imap.tin.it',           port: 993, tls: true },
    'alice.it':      { host: 'imap.alice.it',         port: 993, tls: true },
    'tim.it':        { host: 'imap.tim.it',           port: 993, tls: true },
    'gmail.com':     { host: 'imap.gmail.com',        port: 993, tls: true },
    'outlook.com':   { host: 'outlook.office365.com', port: 993, tls: true },
    'hotmail.com':   { host: 'outlook.office365.com', port: 993, tls: true },
    'hotmail.it':    { host: 'outlook.office365.com', port: 993, tls: true },
    'live.com':      { host: 'outlook.office365.com', port: 993, tls: true },
    'yahoo.com':     { host: 'imap.mail.yahoo.com',   port: 993, tls: true },
    'yahoo.it':      { host: 'imap.mail.yahoo.com',   port: 993, tls: true },
  }

  const handleEmailChange = (email) => {
    const domain = email.split('@')[1]?.toLowerCase()
    const provider = KNOWN_PROVIDERS[domain]
    setForm(f => ({
      ...f, email,
      imap_user: email,
      imap_host: provider?.host || f.imap_host || (domain ? `mail.${domain}` : ''),
      imap_port: provider?.port || f.imap_port || 993,
      imap_tls: provider ? provider.tls : f.imap_tls,
      display_name: f.display_name || email
    }))
  }
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Caselle Email</h2>
            <p className="text-xs text-gray-400 mt-0.5">{mailboxes.length} casell{mailboxes.length === 1 ? 'a' : 'e'} configurate</p>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-xs text-green-600 font-medium">{syncMsg}</span>}
            <button onClick={() => { setBulkText(''); setBulkResult(null); setBulkClient(clients[0]?.id ? String(clients[0].id) : ''); setShowBulk(true) }}
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Upload size={14} />
              <span className="hidden sm:inline">Importa caselle</span>
              <span className="sm:hidden">Importa</span>
            </button>
            <button onClick={openNew}
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ background: branding.primary_color || '#2563eb' }}>
              <Plus size={14} />
              <span className="hidden sm:inline">Nuova casella</span>
              <span className="sm:hidden">Nuova</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : mailboxes.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Inbox size={40} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-700 font-medium mb-1">Nessuna casella configurata</p>
            <p className="text-gray-400 text-sm mb-4">Aggiungi una casella inserendo le credenziali IMAP — verrà creata automaticamente su OpenArchiver</p>
            <button onClick={openNew}
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ background: branding.primary_color || '#2563eb' }}>
              <Plus size={14} /> Aggiungi prima casella
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {mailboxes.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-4 min-w-0">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: branding.primary_color || '#2563eb' }}>
                    {m.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.email}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {m.client_name ? (
                        <span className="text-xs text-gray-500">{m.client_name}</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Non assegnata</span>
                      )}
                      <span className="text-gray-300">·</span>
                      {m.oauth_provider ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
                          {m.oauth_provider === 'microsoft' ? (
                            <svg viewBox="0 0 24 24" className="w-3 h-3"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M13 1h10v10H13z"/><path fill="#7fba00" d="M1 13h10v10H1z"/><path fill="#ffb900" d="M13 13h10v10H13z"/></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="w-3 h-3"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                          )}
                          {m.oauth_provider === 'microsoft' ? 'Microsoft 365' : 'Google'}
                          {m.oauth_refresh_expires_at && (() => {
                            const exp = new Date(m.oauth_refresh_expires_at)
                            const now = new Date()
                            if (exp < now) return (
                              <a href={`/api/oauth/${m.oauth_provider}?token=${localStorage.getItem('mv_token')}${form.client_id ? '&client_id='+form.client_id : ''}`}
                                className="text-red-600 font-semibold hover:underline">· Token scaduto — Ricollegare</a>
                            )
                            if (exp < new Date(Date.now() + 7*24*60*60*1000)) return (
                              <span className="text-amber-600 font-semibold">· Token in scadenza</span>
                            )
                            return null
                          })()}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.has_password ? 'text-green-600' : 'text-amber-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.has_password ? 'bg-green-500' : 'bg-amber-500'}`} />
                          {m.has_password ? 'IMAP configurato' : 'IMAP mancante'}
                        </span>
                      )}
                      {deletingIds.has(m.id) && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                            <Loader2 size={10} className="animate-spin" />
                            Eliminazione in corso<DotDot />
                          </span>
                        </>
                      )}
                    {!deletingIds.has(m.id) && m.active === false && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Disabilitata
                          </span>
                        </>
                      )}
                      {m.email_count > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-blue-500">{m.email_count} email archiviate</span>
                        </>
                      )}
                    </div>
                    {syncStatus[m.id] && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {syncStatus[m.id].status === 'running' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                            <Loader2 size={10} className="animate-spin" /> Sync in corso...
                          </span>
                        ) : syncStatus[m.id].status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 size={10} /> {syncStatus[m.id].emails_synced} email
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500">
                            <AlertCircle size={10} /> Errore sync
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(syncStatus[m.id].finished_at || syncStatus[m.id].started_at).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Pausa/Riprendi sync */}
                  <button onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      await api.post(`/admin/mailboxes/${m.id}/pause`, { paused: !m.sync_paused })
                      load()
                    } catch {}
                  }}
                    title={m.sync_paused ? 'Riprendi sync' : 'Pausa sync'}
                    className={`p-2 rounded-lg transition-colors ${m.sync_paused ? 'text-orange-500 bg-orange-50 hover:bg-orange-100' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}>
                    {m.sync_paused ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                                    <button onClick={async (e) => {
                    e.stopPropagation()
                    setSyncMsg('Sync avviato...')
                    try {
                      await api.post(`/admin/mailboxes/${m.id}/sync`)
                      setSyncMsg(`Sync avviato per ${m.email}`)
                      setTimeout(() => loadSyncStatus(), 3000)
                    } catch { setSyncMsg('Errore sync') }
                    setTimeout(() => setSyncMsg(''), 3000)
                  }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Sincronizza ora">
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleToggleActive(m) }}
                    title={m.active ? 'Disabilita casella' : 'Abilita casella'}
                    className={`p-1.5 rounded-lg transition-colors ${m.active !== false ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}>
                    {m.active !== false ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <ActionMenu onEdit={() => openEdit(m)} onDelete={() => setDeleteItem(m)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast OAuth */}
      {oauthToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${oauthToast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {oauthToast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {oauthToast.msg}
          <button onClick={() => setOauthToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Import in blocco */}
      {showBulk && (
        <Modal title="Importa caselle in blocco" onClose={() => setShowBulk(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente di destinazione</label>
              <select value={bulkClient} onChange={e => setBulkClient(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">— seleziona —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Elenco caselle (una per riga)</label>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={9}
                placeholder={"email@dominio.it;password\ninfo@dominio.it;password;mail.dominio.it;993\naltro@dominio.it"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              <p className="text-xs text-gray-500 mt-1">
                Formato: <span className="font-mono">email;password;host;porta</span> — solo l'email è obbligatoria.
                Se ometti host e porta vengono usati <span className="font-mono">mail.dominio</span> e <span className="font-mono">993</span>.
                Separatori ammessi: <span className="font-mono">;</span> <span className="font-mono">,</span> o TAB. Le righe che iniziano con <span className="font-mono">#</span> sono ignorate.
              </p>
              {bulkText.trim() && (
                <p className="text-xs mt-2">
                  <span className="text-gray-700 font-medium">{bulkValid.length}</span> caselle valide rilevate
                  {bulkItems.length !== bulkValid.length && <span className="text-amber-600"> · {bulkItems.length - bulkValid.length} righe non valide (verranno segnalate)</span>}
                </p>
              )}
            </div>

            {bulkResult && (
              <div className={`text-sm rounded-lg px-3 py-2 ${bulkResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {bulkResult.error ? bulkResult.error : (
                  <>
                    <p className="font-medium">{bulkResult.created} caselle create
                      {bulkResult.skipped > 0 && ` · ${bulkResult.skipped} già presenti`}
                      {bulkResult.failedCount > 0 && ` · ${bulkResult.failedCount} non riuscite`}
                    </p>
                    {bulkResult.failed?.length > 0 && (
                      <ul className="mt-1 text-xs text-red-600 list-disc list-inside max-h-32 overflow-y-auto">
                        {bulkResult.failed.map((f, i) => <li key={i}>{f.email}: {f.error}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowBulk(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Chiudi</button>
              <button onClick={handleBulkImport} disabled={bulkLoading || !bulkClient || !bulkValid.length}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Importa {bulkValid.length > 0 ? bulkValid.length : ''} caselle
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Form modal */}
      {showForm && (
        <Modal title={editItem ? `Modifica — ${editItem.email}` : 'Nuova casella email'} onClose={() => setShowForm(false)}>
          <div className="space-y-3">

            {/* OAuth buttons - solo per nuove caselle */}
            {!editItem && (
              <div className="space-y-2">
                {/* Microsoft 365 */}
                <a href={`/api/oauth/microsoft?token=${localStorage.getItem('mv_token')}${form.client_id ? `&client_id=${form.client_id}` : ''}`}
                  className="flex items-center justify-center gap-3 w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-semibold text-gray-700">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#f25022" d="M1 1h10v10H1z"/>
                    <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                    <path fill="#7fba00" d="M1 13h10v10H1z"/>
                    <path fill="#ffb900" d="M13 13h10v10H13z"/>
                  </svg>
                  Accedi con Microsoft 365
                </a>
                {/* Google / Gmail / Workspace */}
                <a href={`/api/oauth/google?token=${localStorage.getItem('mv_token')}${form.client_id ? `&client_id=${form.client_id}` : ''}`}
                  className="flex items-center justify-center gap-3 w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl hover:border-red-300 hover:bg-red-50 transition-colors text-sm font-semibold text-gray-700">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Accedi con Google / Gmail
                </a>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-200"/>
                  <span className="text-xs text-gray-400">oppure configura manualmente</span>
                  <div className="flex-1 h-px bg-gray-200"/>
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Indirizzo email *</label>
              <input type="email" value={form.email}
                onChange={e => handleEmailChange(e.target.value)}
                disabled={!!editItem}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="info@azienda.it" />
            </div>

            {/* Cliente */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente *</label>
              <select value={form.client_id} onChange={e => { setForm({ ...form, client_id: e.target.value }); loadClientUsers(e.target.value); setAssignedUsers([]); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
                <option value="">— Seleziona cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </div>

            {/* Assegnazione utenti */}
            {form.client_id && clientUsers.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Utenti con accesso alla casella
                </label>
                <UserPicker
                  users={clientUsers.filter(u => u.role !== 'superadmin')}
                  selected={assignedUsers}
                  onChange={setAssignedUsers}
                />
                <p className="text-xs text-gray-400 mt-1">Gli admin vedono automaticamente tutte le caselle del cliente</p>
              </div>
            )}

            {/* IMAP accordion */}
            <ImapAccordion form={form} setForm={setForm} editItem={editItem} />

            {/* Test result */}
            {testResult && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {testResult.success ? <Check size={14} /> : <X size={14} />}
                {testResult.message}
              </div>
            )}

            {/* Save error */}
            {saveError && (
              <div className="flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200">
                <X size={14} className="mt-0.5 shrink-0" />
                {saveError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={handleTest} disabled={testing || !form.imap_host || !form.imap_password}
                className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Test IMAP
              </button>
              <button onClick={handleSave} disabled={!form.email || !form.client_id || saving}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: branding.primary_color || '#2563eb' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editItem ? 'Salva modifiche' : 'Crea casella'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Annulla
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deleteError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl shadow-lg px-4 py-3 max-w-sm">
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-800">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {deleteItem && <ConfirmDelete name={deleteItem.email} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
    </>
  )
}

// ── RIVENDITORI (solo superadmin) ──
function ResellersTab({ branding, user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const emptyForm = { name: '', company: '', active: true, quota_gb: '', max_mailboxes: '', max_users: '', feat_legal_hold: false, feat_import: false, feat_logs: false, feat_backup: false, feat_antivirus: false, feat_antispam: false }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [userFor, setUserFor] = useState(null)
  const [uForm, setUForm] = useState({ email: '', password: '', full_name: '' })
  const [uSaving, setUSaving] = useState(false)
  const GB = 1024 * 1024 * 1024

  const fmt = (b) => { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i] }
  const load = () => { setLoading(true); api.get('/admin/resellers').then(r => setItems(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm(emptyForm); setEditItem(null); setShowForm(true) }
  const openEdit = (r) => {
    setForm({ name: r.name, company: r.company || '', active: r.active,
      quota_gb: r.quota_bytes != null ? +(r.quota_bytes / GB).toFixed(2) : '',
      max_mailboxes: r.max_mailboxes ?? '', max_users: r.max_users ?? '',
      feat_legal_hold: !!r.feat_legal_hold, feat_import: !!r.feat_import, feat_logs: !!r.feat_logs, feat_backup: !!r.feat_backup, feat_antivirus: !!r.feat_antivirus, feat_antispam: !!r.feat_antispam })
    setEditItem(r); setShowForm(true)
  }
  const handleSave = async () => {
    setSaving(true)
    const payload = { name: form.name, company: form.company, active: form.active,
      quota_bytes: form.quota_gb === '' ? null : Math.round(Number(form.quota_gb) * GB),
      max_mailboxes: form.max_mailboxes === '' ? null : Number(form.max_mailboxes),
      max_users: form.max_users === '' ? null : Number(form.max_users),
      feat_legal_hold: form.feat_legal_hold, feat_import: form.feat_import, feat_logs: form.feat_logs, feat_backup: form.feat_backup, feat_antivirus: form.feat_antivirus, feat_antispam: form.feat_antispam }
    try { if (editItem) await api.put(`/admin/resellers/${editItem.id}`, payload); else await api.post('/admin/resellers', payload); setShowForm(false); load() }
    catch (e) { alert(e.response?.data?.error || 'Errore') } finally { setSaving(false) }
  }
  const handleDelete = async () => { try { await api.delete(`/admin/resellers/${deleteItem.id}`) } catch {} setDeleteItem(null); load() }

  const openUser = (r) => { setUserFor(r); setUForm({ email: '', password: generatePassword(), full_name: r.name + ' (accesso)' }) }
  const saveUser = async () => {
    setUSaving(true)
    try { await api.post('/admin/users', { email: uForm.email, password: uForm.password, full_name: uForm.full_name, role: 'reseller', reseller_id: userFor.id }); setUserFor(null) }
    catch (e) { alert(e.response?.data?.error || 'Errore') } finally { setUSaving(false) }
  }

  const bar = (pct, over) => (<div className="w-full bg-gray-100 rounded-full h-1.5 mt-1"><div className={`h-1.5 rounded-full ${over || pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct || 0, 100)}%` }} /></div>)

  return (<>
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Rivenditori ({items.length})</h2>
        <button onClick={openNew} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: branding.primary_color || '#2563eb' }}><Plus size={14} /> Nuovo rivenditore</button>
      </div>
      {loading ? (<div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>)
        : items.length === 0 ? (<div className="text-center py-16"><Store size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">Nessun rivenditore</p></div>)
        : (<table className="w-full"><thead><tr className="border-b border-gray-100">
          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rivenditore</th>
          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Aziende</th>
          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-56">Spazio (uso / pacchetto)</th>
          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Caselle</th>
          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Utenti</th>
          <th className="px-6 py-3 w-20"></th></tr></thead>
          <tbody>{items.map(r => {
            const used = parseInt(r.used_bytes || 0), q = r.quota_bytes != null ? parseInt(r.quota_bytes) : null
            const pct = q && q > 0 ? Math.round(used / q * 100) : null, over = q != null && used >= q
            return (<tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-6 py-3.5"><p className="text-sm font-medium text-gray-900">{r.name}</p>{r.company && <p className="text-xs text-gray-500">{r.company}</p>}{!r.active && <span className="text-xs text-gray-400">disabilitato</span>}</td>
              <td className="px-6 py-3.5 text-right text-sm text-gray-600">{r.client_count}</td>
              <td className="px-6 py-3.5">{q != null ? (<div><div className="flex justify-between text-xs"><span className={over ? 'text-red-600 font-semibold' : 'text-gray-500'}>{pct}%{over ? ' • superata' : ''}</span><span className="text-gray-400">{fmt(used)} / {fmt(q)}</span></div>{bar(pct, over)}</div>) : (<span className="text-xs text-gray-300">∞ illimitato</span>)}</td>
              <td className="px-6 py-3.5 text-right text-sm text-gray-600">{r.mailbox_count}{r.max_mailboxes != null ? ` / ${r.max_mailboxes}` : ''}</td>
              <td className="px-6 py-3.5 text-right text-sm text-gray-600">{r.user_count}{r.max_users != null ? ` / ${r.max_users}` : ''}</td>
              <td className="px-4 py-3.5"><div className="flex items-center gap-1">
                <button onClick={() => openUser(r)} title="Crea utente di accesso" className="p-1.5 text-gray-400 hover:text-blue-600"><KeyRound size={15} /></button>
                <ActionMenu onEdit={() => openEdit(r)} onDelete={() => setDeleteItem(r)} />
              </div></td>
            </tr>)
          })}</tbody></table>)}
    </div>

    {showForm && (<Modal title={editItem ? 'Modifica rivenditore' : 'Nuovo rivenditore'} onClose={() => setShowForm(false)}>
      <div className="space-y-4">
        <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Nome *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="Rossi IT" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Azienda</label><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="Rossi IT Srl" /></div>
        {editItem && (<div className="flex items-center gap-3"><label className="text-xs font-medium text-gray-600">Stato</label><button onClick={() => setForm({ ...form, active: !form.active })} className={`relative inline-flex h-5 w-9 items-center rounded-full ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-4' : 'translate-x-1'}`} /></button><span className="text-xs text-gray-500">{form.active ? 'Attivo' : 'Disabilitato'}</span></div>)}
        <div className="pt-3 border-t border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pacchetto venduto</p><p className="text-xs text-gray-400 mb-3">Vuoto = illimitato. Il rivenditore distribuisce queste quote tra i suoi clienti.</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Spazio (GB)</label><input type="number" min="0" step="1" value={form.quota_gb} onChange={e => setForm({ ...form, quota_gb: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Caselle max</label><input type="number" min="0" step="1" value={form.max_mailboxes} onChange={e => setForm({ ...form, max_mailboxes: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Utenti max</label><input type="number" min="0" step="1" value={form.max_users} onChange={e => setForm({ ...form, max_users: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="∞" /></div>
          </div>
        </div>
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Funzioni incluse</p>
          <div className="grid grid-cols-2 gap-2">
            {[['feat_legal_hold', 'Legal Hold'], ['feat_import', 'Import email'], ['feat_logs', 'Log (Accessi/Sync)'], ['feat_antivirus', 'Antivirus'], ['feat_antispam', 'Antispam'], ['feat_backup', 'Backup propri clienti']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!!form[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} className="rounded border-gray-300" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2"><button onClick={handleSave} disabled={!form.name || saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg text-white disabled:opacity-50" style={{ background: branding.primary_color || '#2563eb' }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{editItem ? 'Salva' : 'Crea rivenditore'}</button><button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button></div>
      </div>
    </Modal>)}

    {userFor && (<Modal title={`Utente di accesso — ${userFor.name}`} onClose={() => setUserFor(null)}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Credenziali con cui il rivenditore accede per gestire i suoi clienti.</p>
        <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label><input value={uForm.email} onChange={e => setUForm({ ...uForm, email: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" placeholder="accesso@rivenditore.it" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Password *</label><div className="flex gap-2"><input value={uForm.password} onChange={e => setUForm({ ...uForm, password: e.target.value })} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" /><button onClick={() => setUForm({ ...uForm, password: generatePassword() })} className="px-3 py-2.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Genera</button></div></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Nome</label><input value={uForm.full_name} onChange={e => setUForm({ ...uForm, full_name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" /></div>
        <div className="flex gap-3 pt-2"><button onClick={saveUser} disabled={!uForm.email || !uForm.password || uSaving} className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg text-white disabled:opacity-50" style={{ background: branding.primary_color || '#2563eb' }}>{uSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Crea accesso</button><button onClick={() => setUserFor(null)} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annulla</button></div>
      </div>
    </Modal>)}

    {deleteItem && <ConfirmDelete name={deleteItem.name} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
  </>)
}
