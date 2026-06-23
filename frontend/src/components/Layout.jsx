import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { Mail, Settings, Users, LogOut, Activity, ShieldCheck, HardDrive, Menu, X, ShieldAlert, BarChart2, ClipboardList, LayoutDashboard, Flag, RefreshCw, Shield, ChevronDown, ChevronRight, Database, Puzzle, Search, ShieldOff, Upload, Bug, KeyRound } from 'lucide-react'

export default function Layout() {
  const { user, logout, refreshAvatar } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const adminPaths = ['/admin', '/legal-hold', '/import']
  const logPaths = ['/logs', '/audit']
  const sistemaPaths = ['/backup', '/settings']
  const [adminOpen, setAdminOpen] = useState(adminPaths.some(p => location.pathname.startsWith(p)))
  const [logOpen, setLogOpen] = useState(logPaths.some(p => location.pathname.startsWith(p)))
  const [sistemaOpen, setSistemaOpen] = useState(sistemaPaths.some(p => location.pathname.startsWith(p)))

  // Aggiorna avatar quando si torna sulla sidebar (es. dopo cambio in Profile)
  useEffect(() => {
    refreshAvatar()
  }, [location.pathname])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])
  useEffect(() => {
    if (adminPaths.some(p => location.pathname.startsWith(p))) setAdminOpen(true)
    if (logPaths.some(p => location.pathname.startsWith(p))) setLogOpen(true)
    if (sistemaPaths.some(p => location.pathname.startsWith(p))) setSistemaOpen(true)
  }, [location.pathname])
  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e) => {
      if (!e.target.closest('#sidebar') && !e.target.closest('#hamburger')) setSidebarOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sidebarOpen])

  const handleLogout = () => { logout(); navigate('/login') }
  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
  const subNavClass = ({ isActive }) =>
    `flex items-center gap-3 pl-8 pr-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`
  const sectionLabel = (label) => (
    <p className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
  )

  const avatarUrl = user?.avatar_url || null
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSuper = user?.role === 'superadmin'
  const isManager = isAdmin || user?.role === 'reseller'

  // Header di un gruppo a comparsa
  const groupBtn = (label, Icon, open, toggle) => (
    <button onClick={toggle}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold w-full text-left text-gray-700 hover:bg-gray-100 transition-all">
      <Icon size={17} /><span className="flex-1">{label}</span>
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  )
  // Stato attivo per i sotto-link verso i tab di /settings
  const settingsTab = (tab) => () => subNavClass({ isActive: location.pathname === '/settings' && location.search === `?tab=${tab}` })
  // Stato attivo per i sotto-link verso i tab di /logs (activity = anche default senza query)
  const logTab = (tab) => () => subNavClass({ isActive: location.pathname === '/logs' && (location.search === `?tab=${tab}` || (tab === 'activity' && location.search === '')) })

  const NavItems = () => (
    <>
      {sectionLabel('Principale')}
      <NavLink to="/dashboard" className={navClass}><LayoutDashboard size={17} /> Dashboard</NavLink>
      <NavLink to="/" end className={navClass}><Mail size={17} /> Email Archiviate</NavLink>
      <NavLink to="/global-search" className={navClass}><Search size={17} /> Ricerca Globale</NavLink>
      <NavLink to="/antispam" className={navClass}><ShieldAlert size={17} /> Antispam</NavLink>

      {isManager && (<>
        {sectionLabel('Gestione')}
        {groupBtn('Amministrazione', Users, adminOpen, () => setAdminOpen(o => !o))}
        {adminOpen && <div className="space-y-0.5">
          <NavLink to="/admin" className={subNavClass}><Users size={15} /> {user?.role === 'reseller' ? 'Aziende e Caselle' : 'Utenti e Caselle'}</NavLink>
          {(isAdmin || (user?.role === 'reseller' && user?.feat?.legal_hold)) && <NavLink to="/legal-hold" className={subNavClass}><ShieldOff size={15} /> Legal Hold</NavLink>}
          {(isAdmin || (user?.role === 'reseller' && user?.feat?.import)) && <NavLink to="/import" className={subNavClass}><Upload size={15} /> Importa Email</NavLink>}
        </div>}
        {(isAdmin || (user?.role === 'reseller' && user?.feat?.logs)) && groupBtn('Log', Activity, logOpen, () => setLogOpen(o => !o))}
        {(isAdmin || (user?.role === 'reseller' && user?.feat?.logs)) && logOpen && <div className="space-y-0.5">
          <NavLink to="/logs?tab=activity" className={logTab('activity')}><KeyRound size={15} /> Accessi</NavLink>
          <NavLink to="/logs?tab=sync" className={logTab('sync')}><RefreshCw size={15} /> Sync Mail</NavLink>
          <NavLink to="/logs?tab=av" className={logTab('av')}><Shield size={15} /> Antivirus</NavLink>
        </div>}
      </>)}

      {isSuper && (<>
        {groupBtn('Sistema', Settings, sistemaOpen, () => setSistemaOpen(o => !o))}
        {sistemaOpen && <div className="space-y-0.5">
          <NavLink to="/backup" className={subNavClass}><HardDrive size={15} /> Backup</NavLink>
          <NavLink to="/settings?tab=sync" className={settingsTab('sync')}><Database size={15} /> Sincronizzazione</NavLink>
          <NavLink to="/settings?tab=av" className={settingsTab('av')}><Shield size={15} /> Antivirus</NavLink>
          <NavLink to="/settings?tab=smtp" className={settingsTab('smtp')}><Mail size={15} /> Notifiche Email</NavLink>
          <NavLink to="/settings?tab=plugin" className={settingsTab('plugin')}><Puzzle size={15} /> Plugin Client</NavLink>
          <NavLink to="/settings?tab=security" className={settingsTab('security')}><ShieldCheck size={15} /> Sicurezza</NavLink>
          <NavLink to="/settings?tab=update" className={settingsTab('update')}><RefreshCw size={15} /> Aggiornamenti</NavLink>
        </div>}
      </>)}

      {isSuper && (
        <div className="pt-2 mt-2 border-t border-gray-100">
          <NavLink to="/reports" className={navClass}><Bug size={17} /> Segnalazioni</NavLink>
        </div>
      )}
    </>
  )

  const UserBar = () => (
    <div className="px-3 py-4 border-t border-gray-100">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
        <button onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0 hover:opacity-80 transition-opacity"
          style={{ background: avatarUrl ? 'transparent' : (branding.primary_color || '#2563eb') }}
          title="Profilo">
          {avatarUrl
            ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            : (user?.full_name || user?.email || '?')[0].toUpperCase()}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('/profile')}>
          <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
          <LogOut size={16} />
        </button>
      </div>
      {branding.footer_text && <p className="text-xs text-gray-400 text-center mt-3">{branding.footer_text}</p>}
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-100">
          <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <NavItems />
        </nav>
        <UserBar />
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside id="sidebar"
        className={`fixed top-0 left-0 h-full w-72 bg-white border-r border-gray-200 flex flex-col z-50 transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto"><NavItems /></nav>
        <UserBar />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button id="hamburger" onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500"><LogOut size={18} /></button>
        </header>
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
