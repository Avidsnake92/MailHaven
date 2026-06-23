import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider } from './context/BrandingContext'
import { useState, useEffect, useCallback } from 'react'
import Login from './pages/Login'
import Setup from './pages/Setup'
import EmailArchive from './pages/Dashboard'
import Statistics from './pages/Statistics'
import AuditLog from './pages/AuditLog'
import Reports from './pages/Reports'
import EmailView from './pages/EmailView'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Security from './pages/Security'
import Backup from './pages/Backup'
import Antispam from './pages/Antispam'
import GlobalSearch from './pages/GlobalSearch'
import Profile from './pages/Profile'
import LegalHold from './pages/LegalHold'
import Import from './pages/Import'
import Layout from './components/Layout'
import UpdateNotification from './components/UpdateNotification'
import api from './services/api'

const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppContent() {
  const { user } = useAuth()
  const [setupDone, setSetupDone] = useState(null)

  useEffect(() => {
    api.get('/setup/status')
      .then(res => setSetupDone(res.data.setup_done))
      .catch(() => setSetupDone(true))
  }, [])

  useEffect(() => {
    const handler = () => setUpdating(true)
    window.addEventListener('mailhaven:update-started', handler)
    return () => window.removeEventListener('mailhaven:update-started', handler)
  }, [])

  const handleUpdateComplete = useCallback(() => {
    setUpdating(false)
    window.location.href = '/login'
  }, [])

  if (setupDone === null) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!setupDone) return <Setup />

  return (
    <>
      {user && user.role === 'superadmin' && (
        <UpdateNotification user={user} />
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route index element={<EmailArchive />} />
          <Route path="dashboard" element={<Statistics />} />
          <Route path="audit" element={<ProtectedRoute roles={['superadmin']}><AuditLog /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="email/:id" element={<EmailView />} />
          <Route path="global-search" element={<GlobalSearch />} />
          <Route path="profile" element={<Profile />} />
          <Route path="antispam" element={<Antispam />} />
          <Route path="backup" element={
            <ProtectedRoute roles={['superadmin', 'reseller']}><Backup /></ProtectedRoute>
          } />
          <Route path="admin" element={
            <ProtectedRoute roles={['admin', 'superadmin', 'reseller']}><Admin /></ProtectedRoute>
          } />
          <Route path="legal-hold" element={
            <ProtectedRoute roles={['admin', 'superadmin', 'reseller']}><LegalHold /></ProtectedRoute>
          } />
          <Route path="import" element={
            <ProtectedRoute roles={['admin', 'superadmin', 'reseller']}><Import /></ProtectedRoute>
          } />
          <Route path="logs" element={
            <ProtectedRoute roles={['admin', 'superadmin', 'reseller']}><Logs /></ProtectedRoute>
          } />
          <Route path="settings" element={
            <ProtectedRoute roles={['superadmin']}><Settings /></ProtectedRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrandingProvider>
    </BrowserRouter>
  )
}
