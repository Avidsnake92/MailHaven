import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function UpdateNotification({ user }) {
  const [updateInfo, setUpdateInfo] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()

  const checkUpdate = useCallback(async () => {
    if (!user || user.role !== 'superadmin') return
    try {
      const res = await api.get('/update/status')
      const data = res.data
      if (!data?.hasUpdate) return
      setUpdateInfo({
        currentVersion: data.current?.version,
        commitsBehind: data.commitsBehind,
        commits: data.latestCommits || [],
      })
    } catch {}
  }, [user])

  useEffect(() => {
    const timer = setTimeout(checkUpdate, 3000)
    return () => clearTimeout(timer)
  }, [checkUpdate])

  if (!updateInfo || dismissed) return null

  return (
    <div style={{
      position: 'fixed', top: '16px', right: '16px', zIndex: 9998,
      background: 'white', borderRadius: '12px', padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '360px',
    }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0, animation: 'pulse 2s infinite' }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
          Aggiornamento disponibile
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
          {updateInfo.commitsBehind} {updateInfo.commitsBehind === 1 ? 'nuova modifica' : 'nuove modifiche'}
        </p>
      </div>
      <button
        onClick={() => { navigate('/settings?tab=update'); setDismissed(true) }}
        style={{
          padding: '6px 12px', borderRadius: '8px', background: '#3b82f6',
          color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
        }}>
        Vedi
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '18px', lineHeight: 1 }}>
        ×
      </button>
    </div>
  )
}
