import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useBranding } from '../context/BrandingContext'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Download, RotateCcw, Paperclip, Loader2, Mail, User, Calendar, Inbox, ChevronDown, AlertTriangle, ShieldCheck, ShieldAlert, X, Shield, ShieldOff } from "lucide-react"

export default function EmailView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { branding } = useBranding()
  const { user } = useAuth()
  const [email, setEmail] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(true)
  const [avResults, setAvResults] = useState(null)
  const [avScanning, setAvScanning] = useState(false)
  const [restoreEmail, setRestoreEmail] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [legalHolding, setLegalHolding] = useState(false)
  const [legalHoldReason, setLegalHoldReason] = useState('')
  const [showHoldDialog, setShowHoldDialog] = useState(false)
  const [msg, setMsg] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)

  useEffect(() => {
    // Load metadata
    api.get(`/emails/${id}`).then(r => {
      setEmail(r.data)
      setLoading(false)
      // Trigger preventive AV scan if email has attachments
      if (r.data.hasAttachments) {
        setAvScanning(true)
        api.get(`/emails/${id}/scan`)
          .then(s => setAvResults(s.data))
          .catch(() => setAvResults(null))
          .finally(() => setAvScanning(false))
      }
    }).catch(() => navigate('/'))

    // Load parsed content
    api.get(`/emails/${id}/content`).then(r => {
      setContent(r.data)
    }).catch(() => setContent(null))
    .finally(() => setContentLoading(false))
  }, [id])

  const handleRestore = async (useOriginalFolder = false) => {
    const target = useOriginalFolder ? email.userEmail : restoreEmail
    if (!target) return
    setRestoring(true)
    try {
      await api.post('/restore/imap', {
        email_ids: [id],
        target_mailbox: target,
        target_folder: useOriginalFolder ? email.path : null
      })
      setMsg(useOriginalFolder ? `Ripristinata in ${email.path}` : 'Email ripristinata!')
    } catch { setMsg('Errore durante il ripristino') }
    finally { setRestoring(false); setTimeout(() => setMsg(''), 3000) }
  }

  const handleExportEml = async () => {
    try {
      const emailData = await api.get(`/emails/${id}`)
      if (!emailData.data.raw) return
      const raw = emailData.data.raw
      const bytes = Array.isArray(raw) ? raw : raw.data || []
      const blob = new Blob([new Uint8Array(bytes)], { type: 'message/rfc822' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `email_${id}.eml`; a.click(); URL.revokeObjectURL(url)
    } catch { setMsg('Errore export EML') }
  }

  const handleExportMbox = async () => {
    try {
      const res = await api.post('/restore/export', { email_ids: [id] }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `email_${id}.mbox`; a.click(); URL.revokeObjectURL(url)
    } catch { setMsg('Errore export MBOX') }
  }

  const handleDownloadAttachment = async (index, filename) => {
    try {
      const res = await api.get(`/emails/${id}/attachment/${index}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = filename; a.click(); URL.revokeObjectURL(url)
    } catch (err) {
      // Check if blocked by AV
      if (err.response?.status === 400) {
        const text = await err.response.data.text?.() || ''
        try {
          const data = JSON.parse(text)
          if (data.infected) {
            setMsg(`⚠️ ${data.error}`)
            return
          }
        } catch {}
      }
      setMsg('Errore download allegato')
    }
  }

  const formatDate = (d) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd MMMM yyyy 'alle' HH:mm", { locale: it }) } catch { return d }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )
  if (!email) return null

  const recipients = email.recipients?.map(r => r.email || r.name).join(', ') || ''

  const handleLegalHold = async (enable) => {
    setLegalHolding(true)
    try {
      await api.post('/emails/legal-hold', {
        email_ids: [id],
        enable,
        reason: legalHoldReason || undefined,
      })
      setShowHoldDialog(false)
      setLegalHoldReason('')
      // Reload email to get updated legal_hold status
      const res = await api.get(`/emails/${id}`)
      setEmail(res.data)
      setMsg(enable ? 'Legal Hold attivato' : 'Legal Hold rimosso')
    } catch (e) {
      setMsg('Errore: ' + (e.response?.data?.error || e.message))
    }
    setLegalHolding(false)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto fade-in">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft size={16} /> Torna all'archivio
      </button>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            {email.subject || '(Nessun oggetto)'}
            {email.spamInfo?.score !== null && email.spamInfo?.score !== undefined && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                email.spamInfo.score >= 5
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {email.spamInfo.score >= 5
                  ? <><AlertTriangle size={11} /> SPAM (Score: {email.spamInfo.score})</>
                  : <><ShieldCheck size={11} /> Score: {email.spamInfo.score}</>
                }
              </span>
            )}
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5">
              <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Da</p>
                <p className="text-sm text-gray-700">{email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">A</p>
                <p className="text-sm text-gray-700">{recipients}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Data</p>
                <p className="text-sm text-gray-700">{formatDate(email.sentAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Inbox size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Casella · Cartella</p>
                <p className="text-sm text-gray-700">{email.userEmail} · {email.path || 'INBOX'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Hold badge */}
        {email?.legal_hold && (
          <div className="mx-4 sm:mx-6 mb-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Shield size={14} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-semibold">Legal Hold attivo</p>
            {email?.legal_hold_reason && <p className="text-xs text-amber-600">??? {email.legal_hold_reason}</p>}
          </div>
        )}
        {/* Actions */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
          {/* Export dropdown */}
          <div className="relative">
            <button onClick={() => setShowExportMenu(m => !m)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-blue-200">
              <Download size={14} /> Esporta <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <div className="absolute top-9 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                <button onClick={() => { setShowExportMenu(false); handleExportEml() }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Download size={13} className="text-blue-500" /> EML
                </button>
                <button onClick={() => { setShowExportMenu(false); handleExportMbox() }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Download size={13} className="text-purple-500" /> MBOX
                </button>
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={() => handleRestore(true)} disabled={restoring}
            className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
            style={{ background: branding.primary_color || '#2563eb' }}>
            {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Ripristina in {email.path || 'INBOX'}
          </button>
          <div className="flex items-center gap-2">
            <input type="email" placeholder="O in altra casella..."
              value={restoreEmail} onChange={e => setRestoreEmail(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-48 bg-white" />
            <button onClick={() => handleRestore(false)} disabled={restoring || !restoreEmail}
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Invia
            </button>
          </div>
          {/* Legal Hold - admin only */}
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <>
              <div className="w-px h-4 bg-gray-200" />
              {email?.legal_hold ? (
                <button onClick={() => handleLegalHold(false)} disabled={legalHolding}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 disabled:opacity-50">
                  {legalHolding ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                  Rimuovi Hold
                </button>
              ) : (
                <button onClick={() => setShowHoldDialog(true)} disabled={legalHolding}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-50">
                  <Shield size={14} /> Legal Hold
                </button>
              )}
            </>
          )}
          {msg && <span className={`text-sm font-medium ${msg.includes('Errore') ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>}
        </div>

        {/* Legal Hold Dialog */}
        {showHoldDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Shield size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Attiva Legal Hold</h3>
                  <p className="text-xs text-gray-500">L'email non potr?? essere eliminata</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Motivo (opzionale)</label>
                <input value={legalHoldReason} onChange={e => setLegalHoldReason(e.target.value)}
                  placeholder="Es: Indagine interna, Contenzioso n??123..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowHoldDialog(false); setLegalHoldReason('') }}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
                <button onClick={() => handleLegalHold(true)} disabled={legalHolding}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60">
                  {legalHolding ? 'Attivazione...' : 'Attiva Hold'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attachments */}
        {content?.attachments?.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Allegati ({content.attachments.length})
              </p>
              {avScanning && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin" /> Scansione AV...
                </span>
              )}
              {avResults && !avScanning && (
                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${avResults.allClean ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {avResults.allClean ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                  {avResults.allClean ? 'Tutti puliti' : 'Infetto rilevato!'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {content.attachments.map((att) => {
                const avResult = avResults?.results?.find(r => r.filename === att.filename)
                return (
                  <button key={att.index} onClick={() => handleDownloadAttachment(att.index, att.filename)}
                    disabled={avResult?.infected}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors disabled:cursor-not-allowed ${
                      avResult?.infected 
                        ? 'bg-red-50 border-red-200 text-red-700' 
                        : avResult?.clean 
                          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}>
                    <Paperclip size={13} className="shrink-0" />
                    <span>{att.filename}</span>
                    {att.size && <span className="text-xs opacity-60">({Math.round(att.size / 1024)}KB)</span>}
                    {avResult?.infected && <ShieldAlert size={13} className="text-red-500" title={avResult.viruses.join(', ')} />}
                    {avResult?.clean && <ShieldCheck size={13} className="text-green-500" />}
                    {avScanning && <Loader2 size={11} className="animate-spin opacity-50" />}
                  </button>
                )
              })}
            </div>
            {avResults?.results?.filter(r => r.infected).map(r => (
              <p key={r.index} className="text-xs text-red-600 mt-2">
                ⚠️ {r.filename}: {r.viruses.join(', ')}
              </p>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-6">
          {contentLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : content?.html ? (
            <iframe
              srcDoc={content.html}
              className="w-full border-0 rounded-lg bg-white"
              sandbox="allow-same-origin"
              style={{ height: '600px' }}
              onLoad={e => {
                // Auto-resize iframe to content
                try {
                  const h = e.target.contentDocument?.body?.scrollHeight
                  if (h && h > 100) e.target.style.height = Math.min(h + 40, 800) + 'px'
                } catch {}
              }}
            />
          ) : content?.text ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {content.text}
            </pre>
          ) : (
            <p className="text-sm text-gray-400 italic">(Nessun contenuto)</p>
          )}
        </div>
      </div>
    </div>
  )
}
