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
      const res = await api.get('/admin/stats/overview')
      setData(res.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Processa timeline per recharts
  const getTimelineData = () => {
    if (!data?.timeline) return []
    const byDate = {}
    const mailboxes = new Set()
    data.timeline.forEach(row => {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date }
      byDate[row.date][row.mailbox] = parseInt(row.count)
      mailboxes.add(row.mailbox)
    })
    return { points: Object.values(byDate).slice(-60), mailboxes: [...mailboxes] }
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Archivio nel tempo</h2>
          <p className="text-xs text-gray-400">Ultimi 60 giorni</p>
        </div>
        {timeline.points.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Nessun dato disponibile</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeline.points} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={d => d ? d.slice(5) : ''} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                labelFormatter={d => `Data: ${d}`} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {timeline.mailboxes.map((mailbox, i) => (
                <Line key={mailbox} type="monotone" dataKey={mailbox}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} strokeOpacity={0.8}
                  dot={false} name={mailbox} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
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
