import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { User, Mail, Phone, Globe, Clock, Shield, Monitor, Trash2, Loader2, Check, AlertTriangle, Key, Lock, Camera, X, Upload } from 'lucide-react'

const TIMEZONES = [
  { value: 'Europe/Rome', label: 'Roma (UTC+1/+2)' },
  { value: 'Europe/London', label: 'Londra (UTC+0/+1)' },
  { value: 'Europe/Paris', label: 'Parigi (UTC+1/+2)' },
  { value: 'Europe/Berlin', label: 'Berlino (UTC+1/+2)' },
  { value: 'America/New_York', label: 'New York (UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'UTC', label: 'UTC' },
]

const LANGUAGES = [
  { value: 'it', label: '🇮🇹 Italiano' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'es', label: '🇪🇸 Español' },
]

// Avatar component
function Avatar({ avatarUrl, name, email, size = 'lg', onClick }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : email?.[0]?.toUpperCase() || '?'
  const colors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500','bg-indigo-500']
  const color = colors[(email?.charCodeAt(0)||0) % colors.length]
  const sz = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'

  if (avatarUrl) {
    return (
      <div className={`${sz} rounded-full overflow-hidden shrink-0 cursor-pointer`} onClick={onClick}>
        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0 cursor-pointer`} onClick={onClick}>
      {initials}
    </div>
  )
}

export default function Profile() {
  const { user, login, refreshAvatar } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef()

  // Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('Europe/Rome')
  const [language, setLanguage] = useState('it')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Sessioni
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  // Key rotation (solo superadmin)
  const [showKeyRotation, setShowKeyRotation] = useState(false)
  const [keyRotPwd, setKeyRotPwd] = useState('')
  const [keyRotLoading, setKeyRotLoading] = useState(false)
  const [keyRotMsg, setKeyRotMsg] = useState('')
  const [keyRotError, setKeyRotError] = useState('')

  useEffect(() => {
    api.get('/auth/me').then(r => {
      setProfile(r.data)
      setFullName(r.data.full_name || '')
      setPhone(r.data.phone || '')
      setTimezone(r.data.timezone || 'Europe/Rome')
      setLanguage(r.data.language || 'it')
      setAvatarUrl(r.data.avatar_url || null)
      setLoading(false)
    }).catch(() => setLoading(false))

    setLoadingSessions(true)
    api.get('/auth/sessions').then(r => setSessions(r.data)).catch(() => {}).finally(() => setLoadingSessions(false))
  }, [])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setError('Il file è troppo grande (max 2MB)')
    const allowed = ['image/jpeg','image/png','image/webp']
    if (!allowed.includes(file.type)) return setError('Formato non supportato. Usa JPG, PNG o WEBP')
    setUploadingAvatar(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const r = await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAvatarUrl(r.data.avatar_url)
      if (refreshAvatar) refreshAvatar()
      setMsg('Avatar aggiornato')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) { setError(e.displayMessage || 'Errore upload') }
    finally { setUploadingAvatar(false) }
  }

  const handleRemoveAvatar = async () => {
    try {
      await api.delete('/auth/avatar')
      setAvatarUrl(null)
    } catch (e) { setError(e.displayMessage || 'Errore') }
  }

  const handleSave = async () => {
    setError(''); setMsg('')
    setSaving(true)
    try {
      const r = await api.put('/auth/profile', { full_name: fullName, phone, timezone, language })
      setProfile(r.data)
      setMsg('Profilo aggiornato con successo')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setError(e.displayMessage || 'Errore durante il salvataggio')
    } finally { setSaving(false) }
  }

  const handleTerminateSession = async (id) => {
    try {
      await api.delete(`/auth/sessions/${id}`)
      setSessions(s => s.filter(x => x.id !== id))
    } catch (e) { setError(e.displayMessage || 'Errore') }
  }

  const handleKeyRotation = async () => {
    setKeyRotError(''); setKeyRotMsg('')
    if (!keyRotPwd) return setKeyRotError('Inserisci la password')
    if (!confirm('⚠️ La rotazione della chiave re-cifra tutte le password IMAP. Operazione irreversibile. Continuare?')) return
    setKeyRotLoading(true)
    try {
      const r = await api.post('/admin/key-rotation', { password: keyRotPwd })
      setKeyRotMsg(r.data.message)
      setKeyRotPwd('')
    } catch (e) {
      setKeyRotError(e.displayMessage || 'Errore durante la rotazione')
    } finally { setKeyRotLoading(false) }
  }

  const formatDate = (d) => {
    try { return format(new Date(d), "d MMM yyyy 'alle' HH:mm", { locale: it }) } catch { return d }
  }

  const iClass = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-blue-500" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 overflow-y-auto">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900">Profilo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestisci le tue informazioni personali e preferenze</p>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2"><Check size={14} />{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* ── Avatar + info base ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar con overlay upload */}
          <div className="relative group shrink-0">
            <Avatar avatarUrl={avatarUrl} name={fullName} email={profile?.email} size="lg"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)} />
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
              <Camera size={20} className="text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-white" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-lg">{fullName || profile?.email}</p>
            <p className="text-sm text-gray-500">{profile?.email}</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              profile?.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
              profile?.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>{profile?.role}</span>
          </div>
        </div>

        {/* Avatar picker — solo upload personalizzato */}
        {showAvatarPicker && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Cambia foto profilo</p>
              <button onClick={() => setShowAvatarPicker(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Upload size={13} /> Carica foto
              </button>
              <span className="text-xs text-gray-400">JPG, PNG, WEBP · max 2MB</span>
              {avatarUrl && avatarUrl.startsWith('/uploads/') && (
                <button onClick={handleRemoveAvatar}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 ml-auto">
                  <Trash2 size={12} /> Rimuovi
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nome completo</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Il tuo nome" className={iClass + ' pl-9'} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={profile?.email || ''} disabled className={iClass + ' pl-9 bg-gray-50 text-gray-400 cursor-not-allowed'} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telefono</label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+39 000 0000000" className={iClass + ' pl-9'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Timezone</label>
              <div className="relative">
                <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className={iClass + ' pl-9 bg-white'}>
                  {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Lingua</label>
              <div className="relative">
                <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className={iClass + ' pl-9 bg-white'}>
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          {profile?.last_login && (
            <p className="text-xs text-gray-400">Ultimo accesso: {formatDate(profile.last_login)}</p>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors ml-auto">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salva modifiche
          </button>
        </div>
      </div>

      {/* ── Sessioni attive ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Monitor size={16} className="text-gray-600" />
          <h2 className="text-base font-semibold text-gray-900">Sessioni attive</h2>
        </div>
        {loadingSessions ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={18} className="animate-spin text-blue-400" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Nessuna sessione attiva</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border ${s.is_current ? 'bg-blue-50 border-blue-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <Monitor size={16} className={s.is_current ? 'text-blue-500' : 'text-gray-400'} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {s.ip_address}
                      {s.is_current && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Sessione corrente</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {s.device_info?.ua?.slice(0, 60) || 'Browser sconosciuto'} · {formatDate(s.last_seen)}
                    </p>
                  </div>
                </div>
                {!s.is_current && (
                  <button onClick={() => handleTerminateSession(s.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Key Rotation (solo superadmin) ── */}
      {profile?.role === 'superadmin' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-gray-600" />
              <h2 className="text-base font-semibold text-gray-900">Rotazione chiave di cifratura</h2>
            </div>
            <button onClick={() => setShowKeyRotation(!showKeyRotation)}
              className="text-xs text-blue-600 hover:underline">
              {showKeyRotation ? 'Nascondi' : 'Mostra'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Genera una nuova chiave AES-256 e re-cifra automaticamente tutte le password IMAP archiviate.
            Operazione irreversibile — eseguire solo se necessario.
          </p>

          {showKeyRotation && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Dopo la rotazione il file <code>.env</code> verrà aggiornato automaticamente.
                  Assicurati di avere un backup prima di procedere.
                </p>
              </div>
              {keyRotMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg">{keyRotMsg}</div>}
              {keyRotError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{keyRotError}</div>}
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="password" value={keyRotPwd} onChange={e => setKeyRotPwd(e.target.value)}
                  placeholder="Conferma con la tua password" className={iClass + ' pl-9'} />
              </div>
              <button onClick={handleKeyRotation} disabled={keyRotLoading || !keyRotPwd}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-40 transition-colors">
                {keyRotLoading ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                Avvia rotazione chiave
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sicurezza rapida ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-gray-600" />
          <h2 className="text-base font-semibold text-gray-900">Sicurezza account</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/security')}
            className="text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            🔒 Cambia password
          </button>
          <button onClick={() => navigate('/security')}
            className="text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            📱 {profile?.totp_enabled ? 'Gestisci 2FA' : 'Attiva 2FA'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Account creato il {profile?.created_at ? formatDate(profile.created_at) : '—'}
        </p>
      </div>
    </div>
  )
}
