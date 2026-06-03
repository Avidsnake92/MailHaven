import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const BrandingContext = createContext({})

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({
    app_name: 'MailHaven',
    primary_color: '#2563eb',
    secondary_color: '#1e40af',
    footer_text: 'MailHaven - Email Archiving',
    logo_url: null,
  })

  useEffect(() => {
    api.get('/branding').then(res => {
      if (res.data) {
        setBranding(res.data)
        // Apply CSS variables
        document.documentElement.style.setProperty('--color-primary', res.data.primary_color || '#2563eb')
        document.documentElement.style.setProperty('--color-secondary', res.data.secondary_color || '#1e40af')
        if (res.data.app_name) document.title = res.data.app_name
      }
    }).catch(() => {})
  }, [])

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export const useBranding = () => useContext(BrandingContext)
