import { useState, useEffect } from 'react'
import { HardDrive, Database, Mail, Building2, Server, ArrowDown, RefreshCw, ChevronDown, ChevronRight, BarChart2 } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const BarUsage = ({ percent, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  }
  const p = Math.min(percent || 0, 100)
  const c = p > 85 ? 'red' : p > 65 ? 'amber' : color
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full transition-all ${colors[c]}`} style={{ width: `${p}%` }} />
    </div>
  )
}

const StatCard = ({ icon: Icon, label, value, sub, color = 'blue' }) => {
  const colors = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    purple: 'text-purple-600 bg-purple-50',
    amber: 'text-amber-600 bg-amber-50',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function Storage() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [mailboxes, setMailboxes] = useState([])
  const [vm, setVm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedClients, setExpandedClients] = useState({})
  const [activeTab, setActiveTab] = useState('overview')

  const role = user?.role || 'user'
  const isSuperadmin = role === 'superadmin'
  const isAdmin = role === 'admin' || isSuperadmin

  const load = async () => {
    setLoading(true)
    try {
      if (isAdmin) {
        const [cRes, mRes] = await Promise.all([
          api.get('/admin/storage/clients'),
          api.get('/admin/storage/mailboxes'),
        ])
        setClients(cRes.data)
        setMailboxes(mRes.data)
      } else {
        const mRes = await api.get('/admin/storage/mailboxes')
        setMailboxes(mRes.data)
      }
      if (isSuperadmin) {
        const vRes = await api.get('/admin/storage/vm')
        setVm(vRes.data)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const totalOriginal = mailboxes.reduce((s, m) => s + m.originalBytes, 0)
  const totalCompressed = mailboxes.reduce((s, m) => s + m.compressedBytes, 0)
  const totalEmails = mailboxes.reduce((s, m) => s + m.emailCount, 0)
  const totalSaved = totalOriginal - totalCompressed
  const totalRatio = totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0

  const mailboxesByClient = (clientId) =>
    mailboxes.filter(m => clients.find(c => c.id === clientId) &&
      mailboxes.some(mb => mb.clientName === clients.find(c => c.id === clientId)?.name))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={24} className="animate-spin text-blue-400" />
    </div>
  )

  return (
    <div className="h-full overflow-y-auto fade-in">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Storage</h1>
            <p className="text-sm text-gray-500 mt-1">Spazio occupato dall'archivio email</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <RefreshCw size={14} /> Aggiorna
          </button>
        </div>

        {/* Cards sommario */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Mail} label="Email totali" value={totalEmails.toLocaleString()} color="blue" />
          <StatCard icon={Database} label="Spazio originale" value={formatBytes(totalOriginal)} color="purple" />
          <StatCard icon={HardDrive} label="Spazio compresso" value={formatBytes(totalCompressed)} sub={`${totalRatio}% risparmiato`} color="green" />
          <StatCard icon={ArrowDown} label="Spazio risparmiato" value={formatBytes(totalSaved)} color="amber" />
        </div>

        {/* VM Stats — solo superadmin */}
        {isSuperadmin && vm && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server size={16} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">Spazio VM</h2>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium ml-1">Superadmin</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Disco di sistema</span>
                  <span className="font-medium">{formatBytes(vm.vm.usedBytes)} / {formatBytes(vm.vm.totalBytes)}</span>
                </div>
                <BarUsage percent={vm.vm.usedPercent} />
                <p className="text-xs text-gray-400 mt-1">{formatBytes(vm.vm.availBytes)} disponibili</p>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Volumi Docker (DB + dati)</span>
                  <span className="font-medium">{formatBytes(vm.docker.dbBytes)}</span>
                </div>
                <BarUsage percent={vm.vm.totalBytes > 0 ? Math.round((vm.docker.dbBytes / vm.vm.totalBytes) * 100) : 0} color="purple" />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        {isAdmin && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors font-medium ${activeTab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Per cliente
            </button>
            <button onClick={() => setActiveTab('mailboxes')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors font-medium ${activeTab === 'mailboxes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Per casella
            </button>
          </div>
        )}

        {/* Tabella clienti */}
        {(isAdmin && activeTab === 'overview') && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Caselle</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Originale</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compresso</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Risparmio</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-300" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.name}</p>
                          {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{c.mailboxCount}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{c.emailCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBytes(c.originalBytes)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatBytes(c.compressedBytes)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-600">{c.compressionRatio}%</span>
                        <BarUsage percent={c.compressionRatio} color="green" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">Totale</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{clients.reduce((s,c) => s+c.mailboxCount, 0)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{totalEmails.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{formatBytes(totalOriginal)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-blue-600">{formatBytes(totalCompressed)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-green-600">{totalRatio}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Tabella caselle */}
        {(activeTab === 'mailboxes' || !isAdmin) && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Casella</th>
                  {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Originale</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compresso</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Risparmio</th>
                </tr>
              </thead>
              <tbody>
                {mailboxes.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-gray-300" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.email}</p>
                          {m.displayName && m.displayName !== m.email && (
                            <p className="text-xs text-gray-400">{m.displayName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-sm text-gray-500">{m.clientName}</td>}
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{m.emailCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBytes(m.originalBytes)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatBytes(m.compressedBytes)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-600">{m.compressionRatio}%</span>
                        <BarUsage percent={m.compressionRatio} color="green" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
