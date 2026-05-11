import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { Mail, Settings, Users, LogOut, Activity, ShieldCheck, HardDrive, Menu, X, ShieldAlert, BarChart2, ClipboardList, ChevronDown, ChevronRight, LayoutDashboard } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(
    location.pathname === '/logs' || location.pathname === '/audit'
  )

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    if (location.pathname === '/logs' || location.pathname === '/audit') {
      setLogsOpen(true)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e) => {
      if (!e.target.closest('#sidebar') && !e.target.closest('#hamburger')) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sidebarOpen])

  const handleLogout = () => { logout(); navigate('/login') }

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  const subNavClass = ({ isActive }) =>
    `flex items-center gap-3 pl-8 pr-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`

  const sectionLabel = (label) => (
    <p className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
  )

  const NavItems = () => (
    <>
      {/* Dashboard */}
      <NavLink to="/dashboard" className={navClass}>
        <LayoutDashboard size={17} /> Dashboard
      </NavLink>

      {/* Email Archiviate */}
      <NavLink to="/" end className={navClass}>
        <Mail size={17} /> Email Archiviate
      </NavLink>

      {/* Antispam */}
      <NavLink to="/antispam" className={navClass}>
        <ShieldAlert size={17} /> Antispam
      </NavLink>

      {/* Gestione — admin e superadmin */}
      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <>
          {sectionLabel('Amministrazione')}
          <NavLink to="/admin" className={navClass}>
            <Users size={17} /> Gestione
          </NavLink>

          {/* Log — gruppo collassabile */}
          <button
            onClick={() => setLogsOpen(o => !o)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium w-full text-left text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-150">
            <Activity size={17} />
            <span className="flex-1">Log</span>
            {logsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {logsOpen && (
            <div className="space-y-0.5">
              <NavLink to="/logs" className={subNavClass}>
                <Activity size={15} /> Attività
              </NavLink>
              {user?.role === 'superadmin' && (
                <NavLink to="/audit" className={subNavClass}>
                  <ClipboardList size={15} /> Audit Log
                </NavLink>
              )}
            </div>
          )}
        </>
      )}

      {/* Superadmin only */}
      {user?.role === 'superadmin' && (
        <>
          {sectionLabel('Sistema')}
          <NavLink to="/backup" className={navClass}>
            <HardDrive size={17} /> Backup
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <Settings size={17} /> Impostazioni
          </NavLink>
        </>
      )}
    </>
  )

  const UserBar = () => (
    <div className="px-3 py-4 border-t border-gray-100">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: branding.primary_color || '#2563eb' }}>
          {(user?.full_name || user?.email || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
          <LogOut size={16} />
        </button>
      </div>
      {branding.footer_text && (
        <p className="text-xs text-gray-400 text-center mt-3">{branding.footer_text}</p>
      )}
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-100">
          <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <NavItems />
        </nav>
        <UserBar />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside id="sidebar"
        className={`fixed top-0 left-0 h-full w-72 bg-white border-r border-gray-200 flex flex-col z-50 transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavItems />
        </nav>
        <UserBar />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button id="hamburger" onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <img src="/logo.svg" alt="MailHaven" style={{ width: '100%', height: 'auto', display: 'block', padding: '0 8px' }} />
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500">
            <LogOut size={18} />
          </button>
        </header>
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
