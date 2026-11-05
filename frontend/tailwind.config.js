/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        // Ritocchi per il contrasto minimo WCAG AA (4.5:1) su sfondi chiari.
        // Un solo gradino piu' scuro: la gerarchia visiva resta la stessa.
        gray: { 500: '#5b6370' },        // testo secondario su bianco / gray-100 / blue-50
        green: { 600: '#15803d' },       // era 3.3:1 su bianco
        emerald: { 600: '#047857' },
        amber: { 600: '#b45309' },       // era 3.1:1 su amber-50
        orange: { 600: '#c2410c' },      // bianco su arancio era 3.6:1
      }
    }
  },
  plugins: []
}
