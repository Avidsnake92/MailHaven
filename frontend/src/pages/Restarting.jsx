import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  { id: 'stop',    label: 'Arresto servizi in corso',         duration: 8000  },
  { id: 'clam',    label: 'Aggiornamento database ClamAV',    duration: 25000 },
  { id: 'daemon',  label: 'Avvio ClamAV daemon',              duration: 15000 },
  { id: 'backend', label: 'Avvio backend MailHaven',          duration: 10000 },
  { id: 'ready',   label: 'Sistema pronto',                   duration: 2000  },
]

const TOTAL_DURATION = STEPS.reduce((a, s) => a + s.duration, 0)

export default function Restarting() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepProgress, setStepProgress] = useState(0)
  const [serverReady, setServerReady] = useState(false)
  const [dots, setDots] = useState('')

  // Animazione puntini
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  // Avanza steps in base al tempo
  useEffect(() => {
    let elapsed = 0
    let stepIndex = 0
    let stepElapsed = 0
    const TICK = 200

    const timer = setInterval(() => {
      elapsed += TICK
      stepElapsed += TICK

      // Progresso globale
      const globalPct = Math.min((elapsed / TOTAL_DURATION) * 100, 99)
      setProgress(Math.round(globalPct))

      // Avanza step se il tempo dello step corrente è scaduto
      if (stepIndex < STEPS.length - 1 && stepElapsed >= STEPS[stepIndex].duration) {
        stepElapsed = 0
        stepIndex++
        setCurrentStep(stepIndex)
      }

      // Progresso step corrente
      const stepPct = Math.min((stepElapsed / STEPS[stepIndex].duration) * 100, 99)
      setStepProgress(Math.round(stepPct))
    }, TICK)

    return () => clearInterval(timer)
  }, [])

  // Polling /api/health ogni 5 secondi
  useEffect(() => {
    // Aspetta almeno 15 secondi prima di iniziare il polling
    const startDelay = setTimeout(() => {
      const poll = setInterval(async () => {
        try {
          const res = await fetch('/api/health', { cache: 'no-store' })
          if (res.ok) {
            setServerReady(true)
            setProgress(100)
            setCurrentStep(STEPS.length - 1)
            setStepProgress(100)
            clearInterval(poll)
            // Redirect dopo 1.5 secondi
            setTimeout(() => navigate('/login'), 1500)
          }
        } catch {}
      }, 5000)
      return () => clearInterval(poll)
    }, 15000)

    return () => clearTimeout(startDelay)
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: 'white', padding: '24px'
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .spin { animation: spin 1.5s linear infinite; }
        .pulse { animation: pulse 2s ease-in-out infinite; }
        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .shimmer-bar {
          background: linear-gradient(90deg, #3b82f6 0%, #6366f1 40%, #a78bfa 60%, #3b82f6 100%);
          background-size: 200% auto;
          animation: shimmer 2s linear infinite;
        }
        .step-done { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); }
        .step-active { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.5); }
        .step-waiting { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); opacity: 0.5; }
        .step-ready { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.6); }
      `}</style>

      <div style={{ width: '100%', maxWidth: '480px' }}>

        {/* Logo / titolo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ 
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'rgba(59,130,246,0.15)', border: '2px solid rgba(59,130,246,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            {serverReady ? (
              <span style={{ fontSize: '32px' }}>✅</span>
            ) : (
              <svg className="spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            )}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            {serverReady ? 'Sistema pronto!' : `Riavvio in corso${dots}`}
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            {serverReady ? 'Reindirizzamento in corso...' : 'Non chiudere questa finestra'}
          </p>
        </div>

        {/* Barra progresso globale */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Progresso totale</span>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6' }}>{progress}%</span>
          </div>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
            <div className={serverReady ? '' : 'shimmer-bar'} style={{
              height: '100%', borderRadius: '99px',
              width: `${progress}%`,
              transition: 'width 0.3s ease',
              background: serverReady ? '#22c55e' : undefined
            }} />
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {STEPS.map((step, i) => {
            const isDone = i < currentStep || serverReady
            const isActive = i === currentStep && !serverReady
            const isWaiting = i > currentStep && !serverReady
            const isReady = serverReady && i === STEPS.length - 1

            return (
              <div key={step.id} className={`fade-in ${isReady ? 'step-ready' : isDone ? 'step-done' : isActive ? 'step-active' : 'step-waiting'}`}
                style={{
                  border: '1px solid', borderRadius: '12px', padding: '14px 16px',
                  animationDelay: `${i * 0.08}s`, opacity: isWaiting ? 0.5 : 1
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Icona stato */}
                  <div style={{ width: '28px', height: '28px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDone ? (
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    ) : isActive ? (
                      <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                      </svg>
                    ) : (
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)' }} />
                    )}
                  </div>

                  {/* Label */}
                  <span style={{
                    fontSize: '13px', fontWeight: isActive ? '600' : '400',
                    color: isDone ? '#86efac' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.4)',
                    flex: 1
                  }}>
                    {step.label}
                  </span>

                  {isDone && !isActive && (
                    <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '500' }}>✓</span>
                  )}
                </div>

                {/* Mini barra per step attivo */}
                {isActive && (
                  <div style={{ marginTop: '10px', marginLeft: '40px' }}>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div className="shimmer-bar" style={{
                        height: '100%', borderRadius: '99px',
                        width: `${stepProgress}%`, transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '32px' }}>
          MailHaven · Verifica automatica ogni 5 secondi
        </p>
      </div>
    </div>
  )
}
