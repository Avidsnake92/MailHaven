import { useState, useEffect, useRef } from 'react'
import { Upload, FileArchive, Mail, Package, CheckCircle, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react'
import api from '../services/api'

const formatBytes = (b) => {
  if (!b) return '0 B'
  const k = 1024, sizes = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const ImportCard = ({ icon: Icon, title, desc, accept, type, onImport, color = 'blue' }) => {
  const ref = useRef()
  const colors = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-600',   btn: 'bg-blue-600 hover:bg-blue-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', btn: 'bg-purple-600 hover:bg-purple-700' },
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  icon: 'text-green-600',  btn: 'bg-green-600 hover:bg-green-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', btn: 'bg-orange-600 hover:bg-orange-700' },
  }
  const c = colors[color]
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0`}>
          <Icon size={18} className={c.icon} />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        </div>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { if (e.target.files[0]) onImport(e.target.files[0], type); e.target.value = ''; }} />
      <button onClick={() => ref.current.click()}
        className={`w-full py-2 text-sm font-semibold text-white rounded-lg ${c.btn} transition-colors`}>
        Seleziona file
      </button>
    </div>
  )
}

export default function Import() {
  const [mailboxes, setMailboxes] = useState([])
  const [mailboxId, setMailboxId] = useState('')
  const [folder, setFolder] = useState('Importata')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/admin/mailboxes').then(r => {
      setMailboxes(r.data)
      if (r.data.length > 0) setMailboxId(String(r.data[0].id))
    }).catch(() => {})
  }, [])

  const doImport = async (file, type) => {
    if (!mailboxId) return setError('Seleziona una casella di destinazione')
    setError(null)
    setResults(null)
    setImporting(true)
    setProgress({ filename: file.name, size: file.size, type })
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mailbox_id', mailboxId)
      if (folder) form.append('folder', folder)
      const res = await api.post(`/import/${type}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000, // 10 min per file grandi
      })
      setResults({ ...res.data, filename: file.name, type })
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Errore import')
    }
    setImporting(false)
    setProgress(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
          <Upload size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Importa email</h1>
          <p className="text-xs text-gray-500">Importa archivi esistenti in MailHaven — PST, EML, ZIP, MBOX</p>
        </div>
      </div>

      {/* Config */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Destinazione</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Casella di destinazione *</label>
            <div className="relative">
              <select value={mailboxId} onChange={e => setMailboxId(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                {mailboxes.length === 0 && <option value="">Nessuna casella disponibile</option>}
                {mailboxes.map(m => (
                  <option key={m.id} value={m.id}>{m.email}{m.display_name ? ` (${m.display_name})` : ''}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cartella di destinazione</label>
            <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="Importata"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <p className="text-xs text-gray-400 mt-1">Per ZIP: verrà usata la struttura interna del file</p>
          </div>
        </div>
      </div>

      {/* Import types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ImportCard icon={Package} title="File PST" desc="Archivio Outlook / Exchange (.pst)" accept=".pst" type="pst" onImport={doImport} color="purple" />
        <ImportCard icon={Mail} title="File EML" desc="Singola email in formato standard (.eml)" accept=".eml" type="eml" onImport={doImport} color="blue" />
        <ImportCard icon={FileArchive} title="ZIP di EML" desc="Cartella di email compresse (.zip)" accept=".zip" type="zip" onImport={doImport} color="orange" />
        <ImportCard icon={FileArchive} title="MBOX" desc="Archivio Thunderbird / Gmail export (.mbox)" accept=".mbox" type="mbox" onImport={doImport} color="green" />
      </div>

      {/* Progress */}
      {importing && progress && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <RefreshCw size={20} className="text-blue-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Import in corso...</p>
              <p className="text-xs text-blue-700 mt-0.5">
                {progress.filename} · {formatBytes(progress.size)} · tipo: {progress.type.toUpperCase()}
              </p>
              <p className="text-xs text-blue-600 mt-1">Questo può richiedere alcuni minuti per file grandi</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !importing && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Errore durante l'import</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && !importing && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Import completato — {results.filename}</h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {results.total !== undefined && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{(results.total || 0).toLocaleString('it-IT')}</p>
                  <p className="text-xs text-gray-500">Totali</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{(results.inserted || 0).toLocaleString('it-IT')}</p>
                <p className="text-xs text-gray-500">Importate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{(results.skipped || 0).toLocaleString('it-IT')}</p>
                <p className="text-xs text-gray-500">Già presenti</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{(results.errors || 0).toLocaleString('it-IT')}</p>
                <p className="text-xs text-gray-500">Errori</p>
              </div>
            </div>
            {results.errorList?.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg">
                <p className="text-xs font-semibold text-red-700 mb-2">Errori (primi {results.errorList.length}):</p>
                {results.errorList.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e.file || e.folder || '—'}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Note sull'importazione</p>
        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
          <li>Le email già presenti (stesso Message-ID) vengono saltate automaticamente</li>
          <li>I file PST di grandi dimensioni possono richiedere diversi minuti</li>
          <li>Le email importate vengono cifrate e compresse come le email archiviate normalmente</li>
          <li>Per ZIP: la struttura delle cartelle interne viene preservata come percorso</li>
          <li>Dimensione massima file: 500 MB per singolo caricamento</li>
        </ul>
      </div>
    </div>
  )
}

