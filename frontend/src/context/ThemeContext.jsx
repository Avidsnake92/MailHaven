import { createContext, useContext, useState, useEffect } from 'react'

export const THEMES = [
  {
    id: 'oceano',
    name: 'Oceano',
    desc: 'Blu classico — tema predefinito',
    primary: '#2563eb',
    secondary: '#1e40af',
    dark: false,
    palette: ['#2563eb', '#dbeafe', '#eff6ff'],
  },
  {
    id: 'foresta',
    name: 'Foresta',
    desc: 'Verde smeraldo, riposante',
    primary: '#059669',
    secondary: '#065f46',
    dark: false,
    palette: ['#059669', '#d1fae5', '#ecfdf5'],
  },
  {
    id: 'viola',
    name: 'Viola',
    desc: 'Viola intenso, creativo',
    primary: '#7c3aed',
    secondary: '#5b21b6',
    dark: false,
    palette: ['#7c3aed', '#ede9fe', '#f5f3ff'],
  },
  {
    id: 'tramonto',
    name: 'Tramonto',
    desc: 'Arancio caldo, energico',
    primary: '#ea580c',
    secondary: '#c2410c',
    dark: false,
    palette: ['#ea580c', '#ffedd5', '#fff7ed'],
  },
  {
    id: 'rosa',
    name: 'Rosa',
    desc: 'Rosa elegante, moderno',
    primary: '#db2777',
    secondary: '#be185d',
    dark: false,
    palette: ['#db2777', '#fce7f3', '#fdf2f8'],
  },
  {
    id: 'cielo',
    name: 'Cielo',
    desc: 'Azzurro chiaro, fresco',
    primary: '#0284c7',
    secondary: '#0369a1',
    dark: false,
    palette: ['#0284c7', '#e0f2fe', '#f0f9ff'],
  },
  {
    id: 'grafite',
    name: 'Grafite',
    desc: 'Grigio professionale, sobrio',
    primary: '#374151',
    secondary: '#1f2937',
    dark: false,
    palette: ['#374151', '#f3f4f6', '#f9fafb'],
  },
  {
    id: 'notte',
    name: 'Notte',
    desc: 'Tema scuro, per ambienti bui',
    primary: '#818cf8',
    secondary: '#6366f1',
    dark: true,
    palette: ['#818cf8', '#1e1b4b', '#0f172a'],
  },
]

const ThemeContext = createContext()

const applyTheme = (theme) => {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.id)
  root.style.setProperty('--color-primary', theme.primary)
  root.style.setProperty('--color-secondary', theme.secondary)
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => localStorage.getItem('mh_theme') || 'oceano')

  useEffect(() => {
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0]
    applyTheme(theme)
  }, [themeId])

  const setTheme = (id) => {
    setThemeId(id)
    localStorage.setItem('mh_theme', id)
  }

  const currentTheme = THEMES.find(t => t.id === themeId) || THEMES[0]

  return (
    <ThemeContext.Provider value={{ themeId, setTheme, currentTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
