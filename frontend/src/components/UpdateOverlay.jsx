import { useEffect, useState } from 'react'

const STEPS = [
  { id: 'wait',    label: 'Avvio aggiornamento in corso',  duration: 60000 },
  { id: 'fetch',   label: 'Download e applicazione patch', duration: 15000 },
  { id: 'build',   label: 'Build frontend',                duration: 30000 },
  { id: 'restart', label: 'Ricostruzione container',       duration: 30000 },
  { id: 'ready',   label: 'Sistema pronto',                duration: 5000  },
]

const TOTAL_DURATION = STEPS.reduce((a, s) => a + s.duration, 0)

export default function UpdateOverlay({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepProgress, setStepProgress] = useState(0)
  const [serverReady, setServerReady] = useState(false)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let elapsed = 0
    let stepIndex = 0
    let stepElapsed = 0
    const TICK = 200
    const timer = setInterval(() => {
      elapsed += TICK
      stepElapsed += TICK
      setProgress(Math.min(Math.round((elapsed / TOTAL_DURATION) * 100), 99))
      if (stepIndex < STEPS.length - 1 && stepElapsed >= STEPS[stepIndex].duration) {
        stepElapsed = 0
        stepIndex++
        setCurrentStep(stepIndex)
      }
      setStepProgress(Math.min(Math.round((stepElapsed / STEPS[stepIndex].duration) * 100), 99))
    }, TICK)
    return () => clearInterval(timer)
  }, [])

  // Polling: aspetta che il server vada GIU' poi che torni SU'
  useEffect(() => {
    let serverWentDown = false

    // Aspetta 60s (cron parte al minuto successivo) poi inizia a monitorare
    const startDelay = setTimeout(() => {
      const downPoll = setInterval(async () => {
        try {
          await fetch('/api/health', { cache: 'no-store' })
          // Server ancora su, continua ad aspettare
        } catch {
          // Server giù — ora aspetta che torni su
          serverWentDown = true
          clearInterval(downPoll)
          const upPoll = setInterval(async () => {
            try {
              const res = await fetch('/api/health', { cache: 'no-store' })
              if (res.ok) {
                setServerReady(true)
                setProgress(100)
                setCurrentStep(STEPS.length - 1)
                setStepProgress(100)
                clearInterval(upPoll)
                setTimeout(() => onComplete(), 2000)
              }
            } catch {}
          }, 3000)
        }
      }, 3000)

      // Timeout massimo 10 minuti
      setTimeout(() => {
        if (!serverWentDown) onComplete()
      }, 10 * 60 * 1000)

    }, 60000)

    return () => clearTimeout(startDelay)
  }, [onComplete])

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: 'white', padding: '24px',
      userSelect: 'none',
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .uo-spin { animation: spin 1.5s linear infinite; }
        .uo-shimmer {
          background: linear-gradient(90deg, #3b82f6 0%, #6366f1 40%, #a78bfa 60%, #3b82f6 100%);
          background-size: 200% auto;
          animation: shimmer 2s linear infinite;
        }
        .uo-fadein { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '68px', height: '68px', borderRadius: '50%',
            background: 'rgba(59,130,246,0.15)', border: '2px solid rgba(59,130,246,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            {serverReady
              ? <span style={{ fontSize: '30px' }}>✅</span>
              : <svg className="uo-spin" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            }
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 4px' }}>
            {serverReady ? 'Aggiornamento completato!' : `Aggiornamento in corso${dots}`}
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            {serverReady ? 'Reindirizzamento...' : 'Non chiudere questa finestra'}
          </p>
        </div>

        {/* Barra globale */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Progresso</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#3b82f6' }}>{progress}%</span>
          </div>
          <div style={{ height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
            <div className={serverReady ? '' : 'uo-shimmer'} style={{
              height: '100%', borderRadius: '99px', width: `${progress}%`,
              transition: 'width 0.3s ease',
              background: serverReady ? '#22c55e' : undefined
            }} />
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {STEPS.map((step, i) => {
            const isDone = i < currentStep || serverReady
            const isActive = i === currentStep && !serverReady
            const isWaiting = i > currentStep && !serverReady
            return (
              <div key={step.id} className="uo-fadein" style={{
                border: '1px solid',
                borderColor: isDone ? 'rgba(34,197,94,0.4)' : isActive ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)',
                background: isDone ? 'rgba(34,197,94,0.1)' : isActive ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                borderRadius: '10px', padding: '12px 14px',
                opacity: isWaiting ? 0.45 : 1,
                animationDelay: `${i * 0.06}s`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '24px', height: '24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDone
                      ? <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      : isActive
                        ? <svg className="uo-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                        : <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.12)' }} />
                    }
                  </div>
                  <span style={{
                    fontSize: '13px', fontWeight: isActive ? '600' : '400', flex: 1,
                    color: isDone ? '#86efac' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.35)'
                  }}>{step.label}</span>
                </div>
                {isActive && (
                  <div style={{ marginTop: '8px', marginLeft: '34px' }}>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.07)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div className="uo-shimmer" style={{ height: '100%', borderRadius: '99px', width: `${stepProgress}%`, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '28px' }}>
          MailHaven · Verifica automatica ogni 3 secondi
        </p>
      </div>
    </div>
  )
}
