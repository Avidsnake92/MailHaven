import { useState, useEffect } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { Users, Building2, Inbox, Plus, Check, X, Loader2, MoreVertical, Pencil, Trash2, RefreshCw, ChevronDown } from 'lucide-react'

const tabs = ['Clienti', 'Utenti', 'Caselle Email']

export default function Admin() {
  const [tab, setTab] = useState(0)
  const { user } = useAuth()
  const { branding } = useBranding()

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto h-full overflow-y-auto fade-in">
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
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <ClientsTab branding={branding} user={user} />}
      {tab === 1 && <UsersTab branding={branding} user={user} />}
      {tab === 2 && <MailboxesTab branding={branding} user={user} />}
    </div>
  )
}

function ActionMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none' }}
      >
        <MoreVertical size={16} color="#9ca3af" />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'fixed',
            zIndex: 9999,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            minWidth: '160px',
            padding: '4px 0',
            marginTop: '4px',
          }}>
            <button
              onClick={() => { onEdit(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#374151' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Pencil size={14} color="#9ca3af" /> Modifica
            </button>
            <button
              onClick={() => { onDelete(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#dc2626' }}
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: 'min(90vh, 700px)' }}>
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

// ---- CLIENTS ----
function ClientsTab({ branding, user }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [form, setForm] = useState({ name: '', company: '', active: true })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/clients').then(r => setClients(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm({ name: '', company: '', active: true }); setEditItem(null); setShowForm(true) }
  const openEdit = (c) => { setForm({ name: c.name, company: c.company || '', active: c.active }); setEditItem(c); setShowForm(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editItem) await api.put(`/admin/clients/${editItem.id}`, form)
      else await api.post('/admin/clients', form)
      setShowForm(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await api.delete(`/admin/clients/${deleteItem.id}`) } catch { }
    setDeleteItem(null); load()
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-xl">
          <h2 className="font-semibold text-gray-900">Clienti ({clients.length})</h2>
          {user.role === 'superadmin' && (
            <button onClick={openNew} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ background: branding.primary_color || '#2563eb' }}>
              <Plus size={14} /> Nuovo cliente
            </button>
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
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stato</th>
              <th className="px-6 py-3 w-12"></th>
            </tr></thead>
            <tbody>{clients.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-6 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500 sm:hidden">{c.company || ''} · {c.active ? 'Attivo' : 'Disabilitato'}</p>
                </td>
                <td className="hidden sm:table-cell px-6 py-3.5 text-sm text-gray-600">{c.company || '—'}</td>
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
    try { await api.delete(`/admin/users/${deleteItem.id}`) } catch { }
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
                <td className="hidden md:table-cell px-6 py-3.5 text-sm text-gray-600">{u.client_name || '—'}</td>
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
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Ruolo</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none">
                  {user.role === 'superadmin' && <><option value="superadmin">Super Admin</option><option value="admin">Admin</option></>}
                  <option value="user">Utente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cliente</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none">
                  <option value="">— Nessuno —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({
    client_id: '', email: '', display_name: '',
    imap_host: '', imap_port: 993, imap_tls: true,
    imap_user: '', imap_password: '', allow_insecure_tls: false
  })

  const load = async () => {
    setLoading(true)
    const [m, c] = await Promise.all([api.get('/admin/mailboxes'), api.get('/admin/clients')])
    setMailboxes(m.data); setClients(c.data); setLoading(false)
  }

  useEffect(() => { load() }, [])

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
      if (editItem) await api.put(`/admin/mailboxes/${editItem.id}`, form)
      else await api.post('/admin/mailboxes', form)
      setShowForm(false); load()
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await api.delete(`/admin/mailboxes/${deleteItem.id}`) } catch { }
    setDeleteItem(null); load()
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

  // Auto-fill host when email changes
  const handleEmailChange = (email) => {
    const domain = email.split('@')[1]
    setForm(f => ({
      ...f, email,
      imap_user: email,
      imap_host: f.imap_host || (domain ? `mail.${domain}` : ''),
      display_name: f.display_name || email
    }))
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Caselle Email</h2>
            <p className="text-xs text-gray-400 mt-0.5">{mailboxes.length} casell{mailboxes.length === 1 ? 'a' : 'e'} configurate</p>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-xs text-green-600 font-medium">{syncMsg}</span>}
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
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.has_password ? 'text-green-600' : 'text-amber-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.has_password ? 'bg-green-500' : 'bg-amber-500'}`} />
                        {m.has_password ? 'IMAP configurato' : 'IMAP mancante'}
                      </span>
                      {m.email_count > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-blue-500">{m.email_count} email archiviate</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async (e) => {
                    e.stopPropagation()
                    setSyncMsg('Sync avviato...')
                    try {
                      await api.post(`/admin/mailboxes/${m.id}/sync`)
                      setSyncMsg(`Sync avviato per ${m.email}`)
                    } catch { setSyncMsg('Errore sync') }
                    setTimeout(() => setSyncMsg(''), 3000)
                  }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Sincronizza ora">
                    <RefreshCw size={14} />
                  </button>
                  <ActionMenu onEdit={() => openEdit(m)} onDelete={() => setDeleteItem(m)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <Modal title={editItem ? `Modifica — ${editItem.email}` : 'Nuova casella email'} onClose={() => setShowForm(false)}>
          <div className="space-y-3">

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
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
                <option value="">— Seleziona cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </div>

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
      {deleteItem && <ConfirmDelete name={deleteItem.email} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
    </>
  )
}
