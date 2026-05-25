import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

const INACTIVITY_TIMEOUT = 30 * 60 * 1000      // 30 minuti inattività
const WARNING_BEFORE = 2 * 60 * 1000            // avviso 2 minuti prima
const REFRESH_INTERVAL = 10 * 60 * 1000         // refresh token ogni 10 minuti

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('mv_user')
    return u ? JSON.parse(u) : null
  })
  const [loading, setLoading] = useState(false)
  const [sessionWarning, setSessionWarning] = useState(false) // mostra avviso scadenza

  const inactivityTimer = useRef(null)
  const warningTimer = useRef(null)
  const refreshTimer = useRef(null)

  const logout = useCallback(async (reason = '') => {
    // Invalida token sul backend (blacklist)
    try {
      const token = localStorage.getItem('mv_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } catch {}
    localStorage.removeItem('mv_token')
    localStorage.removeItem('mv_user')
    setUser(null)
    setSessionWarning(false)
    clearTimeout(inactivityTimer.current)
    clearTimeout(warningTimer.current)
    clearInterval(refreshTimer.current)
    if (reason) {
      sessionStorage.setItem('logout_reason', reason)
    }
    window.location.href = '/login'
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const res = await api.post('/auth/refresh')
      localStorage.setItem('mv_token', res.data.token)
    } catch (err) {
      // 401 = sessione di 8 ore scaduta
      logout('Sessione scaduta. Effettua nuovamente il login.')
    }
  }, [logout])

  const resetInactivityTimer = useCallback(() => {
    setSessionWarning(false)
    clearTimeout(inactivityTimer.current)
    clearTimeout(warningTimer.current)

    // Avviso 2 minuti prima del logout
    warningTimer.current = setTimeout(() => {
      setSessionWarning(true)
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE)

    // Logout per inattività
    inactivityTimer.current = setTimeout(() => {
      logout('Sessione scaduta per inattività.')
    }, INACTIVITY_TIMEOUT)
  }, [logout])

  // Avvia timer quando l'utente è loggato
  useEffect(() => {
    if (!user) return

    // Eventi di attività utente
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    const handleActivity = () => resetInactivityTimer()

    events.forEach(e => window.addEventListener(e, handleActivity))
    resetInactivityTimer()

    // Refresh token ogni 10 minuti
    refreshTimer.current = setInterval(refreshToken, REFRESH_INTERVAL)

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity))
      clearTimeout(inactivityTimer.current)
      clearTimeout(warningTimer.current)
      clearInterval(refreshTimer.current)
    }
  }, [user, resetInactivityTimer, refreshToken])

  const login = async (email, password, totp_code) => {
    const res = await api.post('/auth/login', { email, password, totp_code })
    if (res.data.requires_2fa) return res.data
    localStorage.setItem('mv_token', res.data.token)
    localStorage.setItem('mv_user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data.user
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, sessionWarning, resetInactivityTimer }}>
      {/* Avviso sessione in scadenza */}
      {sessionWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            maxWidth: '400px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏱️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#1a1a2e' }}>Sessione in scadenza</h2>
            <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px' }}>
              Verrai disconnesso tra <strong>2 minuti</strong> per inattività.
            </p>
            <button
              onClick={resetInactivityTimer}
              style={{
                background: '#3b82f6', color: 'white', border: 'none',
                borderRadius: '8px', padding: '12px 24px', fontSize: '15px',
                cursor: 'pointer', width: '100%', fontWeight: '600'
              }}
            >
              Rimani connesso
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
