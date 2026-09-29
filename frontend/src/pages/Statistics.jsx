import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Mail, HardDrive, TrendingUp, ShieldAlert, RefreshCw, Inbox, Clock } from 'lucide-react'
import api from '../services/api'

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#4338ca', '#0ea5e9', '#7c3aed']
const COLORS_ALPHA = ['rgba(59,130,246,0.65)', 'rgba(99,102,241,0.65)', 'rgba(139,92,246,0.65)', 'rgba(6,182,212,0.65)', 'rgba(16,185,129,0.65)', 'rgba(67,56,202,0.65)', 'rgba(14,165,233,0.65)', 'rgba(124,58,237,0.65)']

const StatCard = ({ icon: Icon, label, value, sub, color = '#1d4ed8', bg = '#eff6ff' }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
    <div style={{ background: bg }} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
      <Icon size={18} style={{ color }} />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
)

export default function Statistics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timelineView, setTimelineView] = useState('all') // 'all' | mailbox email

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // /admin/* e' negato a chi non e' admin/superadmin/reseller: da qui la
      // dashboard di un utente normale rispondeva 403. Ora l'endpoint sta sotto
      // /emails e vale per tutti i ruoli, con lo scoping per casella assegnata.
      const res = await api.get('/emails/stats/overview')
      setData(res.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Serie giornaliera degli ultimi 60 giorni, giorni a zero compresi. Prima i
  // giorni senza email mancavano del tutto: le linee si spezzavano e l'asse delle
  // date non era uniforme. Senza dati restituiva [] e .points faceva errore.
  const TIMELINE_DAYS = 60
  const getTimelineData = () => {
    const rows = data?.timeline || []
    const mailboxes = [...new Set(rows.map(r => r.mailbox))].sort()
    const counts = {}
    rows.forEach(r => {
      if (!counts[r.date]) counts[r.date] = {}
      counts[r.date][r.mailbox] = parseInt(r.count) || 0
    })
    const points = []
    const today = new Date()
    for (let i = TIMELINE_DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('sv-SE') // AAAA-MM-GG in ora locale
      const day = counts[key] || {}
      const p = { date: key, totale: 0 }
      mailboxes.forEach(m => { p[m] = day[m] || 0; p.totale += p[m] })
      points.push(p)
    }
    return { points, mailboxes, hasData: rows.length > 0 }
  }

  const timeline = getTimelineData()

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw size={28} className="animate-spin text-blue-500" />
    </div>
  )

  if (!data) return (
    <div className="text-center py-24 text-gray-500">Errore caricamento statistiche</div>
  )

  const { totals, byMailbox, spamStats } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <TrendingUp size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Statistiche</h1>
            <p className="text-xs text-gray-500">Panoramica archivio email</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Aggiorna
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Mail} label="Email archiviate" value={parseInt(totals.email_count).toLocaleString('it-IT')} sub="totale" color="#1d4ed8" bg="#eff6ff" />
        <StatCard icon={Inbox} label="Caselle attive" value={totals.mailbox_count} sub="monitorate" color="#15803d" bg="#f0fdf4" />
        <StatCard icon={HardDrive} label="Spazio utilizzato" value={formatBytes(parseInt(totals.total_size))} sub="archivio totale" color="#7e22ce" bg="#faf5ff" />
        <StatCard icon={TrendingUp} label="Ultimi 30 giorni" value={parseInt(totals.last_30_days).toLocaleString('it-IT')} sub={`+${parseInt(totals.last_7_days).toLocaleString('it-IT')} ultima settimana`} color="#4338ca" bg="#eef2ff" />
      </div>

      {/* Timeline Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Archivio nel tempo</h2>
            <p className="text-xs text-gray-400">Email archiviate al giorno, ultimi {TIMELINE_DAYS} giorni</p>
          </div>
          {timeline.mailboxes.length > 1 && (
            <select value={timelineView} onChange={e => setTimelineView(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Cosa mostrare nel grafico">
              <option value="all">Totale di tutte le caselle</option>
              <option value="each">Una linea per casella</option>
              {timeline.mailboxes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
        {!timeline.hasData ? (
          <div className="text-center py-12 text-gray-400 text-sm">Nessun dato disponibile</div>
        ) : (() => {
          // Con molte caselle, una linea per ciascuna diventa un groviglio: di
          // default si mostra il totale, la singola casella si sceglie dal menu.
          const view = timelineView === 'each' || timelineView === 'all' || timeline.mailboxes.includes(timelineView)
            ? timelineView : 'all'
          const series = view === 'all' ? [{ key: 'totale', name: 'Totale', color: '#2563eb' }]
            : view === 'each' ? timeline.mailboxes.map((m, i) => ({ key: m, name: m, color: COLORS[i % COLORS.length] }))
            : [{ key: view, name: view, color: '#2563eb' }]
          return (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={timeline.points} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  labelFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })} />
                {series.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                {series.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                    stroke={s.color} strokeWidth={series.length > 1 ? 1.5 : 2}
                    strokeOpacity={series.length > 1 ? 0.8 : 1} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        })()}
      </div>

      {/* Email per casella */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Email per casella</h2>
          {byMailbox.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nessuna casella</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMailbox.map(m => ({ name: m.email.split('@')[0], email: m.email, count: parseInt(m.email_count) }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  formatter={(v, n, p) => [v.toLocaleString('it-IT'), p.payload.email]} />
                <Bar dataKey="count" name="Email" radius={[4, 4, 0, 0]}>
                  {byMailbox.map((_, i) => (
                    <Cell key={i} fill={COLORS_ALPHA[i % COLORS_ALPHA.length]} stroke={COLORS[i % COLORS.length]} strokeWidth={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Spam per casella */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldAlert size={16} className="text-orange-500" /> Spam intercettato
          </h2>
          {spamStats.every(s => parseInt(s.spam_count) === 0) ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nessuno spam registrato</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={spamStats.map(s => ({ name: s.email.split('@')[0], email: s.email, count: parseInt(s.spam_count) }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  formatter={(v, n, p) => [v.toLocaleString('it-IT'), p.payload.email]} />
                <Bar dataKey="count" name="Spam" fill="rgba(16,185,129,0.65)" stroke="#10b981" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabella caselle */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Dettaglio caselle</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {byMailbox.map((m, i) => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}>
                {m.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.display_name || m.email}</p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{parseInt(m.email_count).toLocaleString('it-IT')}</p>
                <p className="text-xs text-gray-400">email</p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-sm font-medium text-gray-700">{formatBytes(parseInt(m.total_size))}</p>
                <p className="text-xs text-gray-400">spazio</p>
              </div>
              <div className="text-right shrink-0 hidden md:block">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Clock size={11} /> {formatDate(m.last_sync)}
                </p>
                <p className="text-xs text-gray-400">ultima sync</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-blue-600">+{parseInt(m.last_30_days).toLocaleString('it-IT')}</p>
                <p className="text-xs text-gray-400">30 giorni</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
