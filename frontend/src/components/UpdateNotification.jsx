import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// Confronta versioni — true se remota è major/minor superiore
const isMajorUpdate = (current, remote) => {
  if (!current || !remote) return false
  const [cMaj, cMin] = current.split('.').map(Number)
  const [rMaj, rMin] = remote.split('.').map(Number)
  return rMaj > cMaj || (rMaj === cMaj && rMin > cMin)
}

const isPatchUpdate = (current, remote) => {
  if (!current || !remote) return false
  const [cMaj, cMin, cPat] = current.split('.').map(Number)
  const [rMaj, rMin, rPat] = remote.split('.').map(Number)
  return rMaj === cMaj && rMin === cMin && rPat > cPat
}

export default function UpdateNotification({ user }) {
  const [updateInfo, setUpdateInfo] = useState(null) // { type: 'major'|'patch', currentVersion, remoteVersion, commits }
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()

  const checkUpdate = useCallback(async () => {
    if (!user || user.role !== 'superadmin') return
    try {
      const res = await api.get('/update/status')
      const data = res.data
      if (!data?.hasUpdate) return

      const current = data.current?.version
      const remote = data.latestCommits?.[0]?.version || null

      // Leggi versione remota dal version.json tramite commit
      // Usiamo commitsBehind e confronto versione installata
      if (isMajorUpdate(current, getRemoteVersion(data))) {
        setUpdateInfo({
          type: 'major',
          currentVersion: current,
          remoteVersion: getRemoteVersion(data),
          commits: data.latestCommits || [],
          commitsBehind: data.commitsBehind
        })
      } else if (data.hasUpdate) {
        setUpdateInfo({
          type: 'patch',
          currentVersion: current,
          commits: data.latestCommits || [],
          commitsBehind: data.commitsBehind
        })
      }
    } catch {}
  }, [user])

  // Stima versione remota dai commit messages
  const getRemoteVersion = (data) => {
    const bumpCommit = data.latestCommits?.find(c =>
      c.message?.includes('bump') || c.message?.includes('version')
    )
    if (bumpCommit) {
      const match = bumpCommit.message.match(/\d+\.\d+\.\d+/)
      if (match) return match[0]
    }
    return null
  }

  useEffect(() => {
    // Controlla dopo 3 secondi dal login (per non rallentare il caricamento)
    const timer = setTimeout(checkUpdate, 3000)
    return () => clearTimeout(timer)
  }, [checkUpdate])

  if (!updateInfo || dismissed) return null

  // Solo major/minor → popup prominente
  if (updateInfo.type === 'major') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px'
      }}>
        <style>{`
          @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .update-modal { animation: slideUp 0.4s ease-out forwards; }
          @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          .pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
        `}</style>
        <div className="update-modal" style={{
          background: 'white', borderRadius: '20px', padding: '0',
          maxWidth: '480px', width: '100%',
          boxShadow: '0 32px 80px rgba(0,0,0,0.4)', overflow: 'hidden'
        }}>
          {/* Header colorato */}
          <div style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 100%)',
            padding: '28px 28px 24px', color: 'white'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div className="pulse-dot" style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: '#34d399', flexShrink: 0
              }} />
              <span style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.8 }}>
                Aggiornamento importante disponibile
              </span>
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: '800' }}>
              🚀 Nuova versione MailHaven
            </h2>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>
              {updateInfo.commitsBehind} {updateInfo.commitsBehind === 1 ? 'modifica' : 'modifiche'} disponibili
            </p>
          </div>

          {/* Contenuto */}
          <div style={{ padding: '24px 28px' }}>
            {/* Commits */}
            {updateInfo.commits.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Novità in arrivo
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {updateInfo.commits.slice(0, 4).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#4f46e5', fontFamily: 'monospace', fontSize: '11px', marginTop: '2px', flexShrink: 0 }}>{c.hash}</span>
                      <span style={{ color: '#374151' }}>{c.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottoni */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setDismissed(true); navigate('/settings?tab=update') }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1e40af, #4f46e5)',
                  color: 'white', border: 'none', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '700'
                }}>
                Aggiorna ora
              </button>
              <button
                onClick={() => setDismissed(true)}
                style={{
                  padding: '12px 16px', borderRadius: '10px',
                  background: '#f3f4f6', color: '#6b7280',
                  border: 'none', cursor: 'pointer', fontSize: '14px'
                }}>
                Dopo
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Patch → banner discreto in alto
  return (
    <div style={{
      position: 'fixed', top: '16px', right: '16px', zIndex: 9998,
      background: 'white', borderRadius: '12px', padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '360px',
      animation: 'slideUp 0.3s ease-out forwards'
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
          Aggiornamento disponibile
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
          {updateInfo.commitsBehind} {updateInfo.commitsBehind === 1 ? 'nuova modifica' : 'nuove modifiche'}
        </p>
      </div>
      <button
        onClick={() => { setDismissed(true); navigate('/settings?tab=update') }}
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
