import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider } from './context/BrandingContext'
import { useState, useEffect, useCallback } from 'react'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import EmailView from './pages/EmailView'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Security from './pages/Security'
import Backup from './pages/Backup'
import Antispam from './pages/Antispam'
import Layout from './components/Layout'
import AuditLog from './pages/AuditLog'
import UpdateNotification from './components/UpdateNotification'
import UpdateOverlay from './components/UpdateOverlay'
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
  const [updating, setUpdating] = useState(false)

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
      {updating && <UpdateOverlay onComplete={handleUpdateComplete} />}
      {user && user.role === 'superadmin' && !updating && (
        <UpdateNotification user={user} />
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="email/:id" element={<EmailView />} />
          <Route path="antispam" element={<Antispam />} />
          <Route path="backup" element={
            <ProtectedRoute roles={['superadmin']}><Backup /></ProtectedRoute>
          } />
          <Route path="admin" element={
            <ProtectedRoute roles={['admin', 'superadmin']}><Admin /></ProtectedRoute>
          } />
          <Route path="logs" element={
            <ProtectedRoute roles={['admin', 'superadmin']}><Logs /></ProtectedRoute>
          } />
          <Route path="audit" element={
            <ProtectedRoute roles={['superadmin']}><AuditLog /></ProtectedRoute>
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
