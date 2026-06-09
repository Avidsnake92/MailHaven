import { Check, Palette } from 'lucide-react'
import { useTheme, THEMES } from '../context/ThemeContext'

const MiniPreview = ({ theme }) => {
  const [p, light, bg] = theme.palette
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm" style={{ height: 72 }}>
      <div className="flex h-full">
        {/* Sidebar mini */}
        <div className="w-10 flex-shrink-0 flex flex-col gap-1 p-1.5"
          style={{ backgroundColor: theme.dark ? '#1e293b' : '#ffffff', borderRight: `1px solid ${theme.dark ? '#334155' : '#f1f5f9'}` }}>
          <div className="w-full h-2 rounded-sm" style={{ backgroundColor: p, opacity: 0.9 }} />
          <div className="w-full h-1.5 rounded-sm" style={{ backgroundColor: theme.dark ? '#334155' : '#f1f5f9' }} />
          <div className="w-3/4 h-1.5 rounded-sm" style={{ backgroundColor: theme.dark ? '#334155' : '#f1f5f9' }} />
          <div className="w-full h-1.5 rounded-sm" style={{ backgroundColor: p, opacity: 0.2 }} />
          <div className="w-4/5 h-1.5 rounded-sm" style={{ backgroundColor: theme.dark ? '#334155' : '#f1f5f9' }} />
        </div>
        {/* Content mini */}
        <div className="flex-1 p-1.5 flex flex-col gap-1"
          style={{ backgroundColor: theme.dark ? '#0f172a' : '#f8fafc' }}>
          {/* Card */}
          <div className="rounded p-1 flex flex-col gap-0.5"
            style={{ backgroundColor: theme.dark ? '#1e293b' : '#ffffff', border: `1px solid ${theme.dark ? '#334155' : '#e2e8f0'}` }}>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p }} />
              <div className="h-1.5 rounded-sm flex-1" style={{ backgroundColor: theme.dark ? '#475569' : '#e2e8f0' }} />
            </div>
            <div className="h-1 rounded-sm w-4/5" style={{ backgroundColor: theme.dark ? '#334155' : '#f1f5f9' }} />
          </div>
          {/* Row */}
          <div className="flex gap-1">
            <div className="h-2.5 rounded flex-1" style={{ backgroundColor: theme.dark ? '#1e293b' : '#ffffff', border: `1px solid ${theme.dark ? '#334155' : '#e2e8f0'}` }} />
            <div className="h-2.5 rounded px-1 flex items-center" style={{ backgroundColor: p }}>
              <div className="h-1 w-4 rounded-sm bg-white opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Themes() {
  const { themeId, setTheme } = useTheme()

  const light = THEMES.filter(t => !t.dark)
  const dark  = THEMES.filter(t => t.dark)

  const ThemeCard = ({ theme }) => {
    const active = themeId === theme.id
    return (
      <button
        onClick={() => setTheme(theme.id)}
        className={`relative text-left rounded-xl p-3 border-2 transition-all duration-150 hover:shadow-md ${
          active ? 'border-[var(--color-primary)] shadow-md' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {active && (
          <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            <Check size={11} className="text-white" strokeWidth={3} />
          </div>
        )}
        <MiniPreview theme={theme} />
        <div className="mt-2.5 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white ring-offset-1 shadow-sm"
            style={{ backgroundColor: theme.primary }} />
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-none">{theme.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{theme.desc}</p>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
          <Palette size={18} style={{ color: 'var(--color-primary)' }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Temi</h1>
          <p className="text-xs text-gray-500">Scegli l'aspetto visivo di MailHaven</p>
        </div>
      </div>

      {/* Temi chiari */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Temi chiari</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {light.map(t => <ThemeCard key={t.id} theme={t} />)}
        </div>
      </div>

      {/* Tema scuro */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Tema scuro</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {dark.map(t => <ThemeCard key={t.id} theme={t} />)}
        </div>
        <p className="mt-3 text-xs text-gray-400">Il tema scuro è sperimentale — alcune sezioni potrebbero avere contrasti non ottimali.</p>
      </div>

      {/* Reset */}
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-5 py-3">
        <div>
          <p className="text-sm font-medium text-gray-700">Ripristina tema predefinito</p>
          <p className="text-xs text-gray-400">Torna al tema Oceano (blu classico)</p>
        </div>
        <button
          onClick={() => setTheme('oceano')}
          disabled={themeId === 'oceano'}
          className="px-4 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Ripristina
        </button>
      </div>
    </div>
  )
}
