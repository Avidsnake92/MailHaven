import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Inject token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mv_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle responses — estrae codice errore MH se presente
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      if (!err.config?.url?.includes('/auth/refresh')) {
        localStorage.removeItem('mv_token')
        localStorage.removeItem('mv_user')
        window.location.href = '/login'
      }
    }

    // Arricchisce l'errore con code e message strutturati
    const data = err.response?.data
    if (data?.code) {
      err.mhCode    = data.code
      err.mhMessage = data.error
      err.mhDetail  = data.detail
      // Messaggio formattato da mostrare in UI: "[MH-1203] Eliminazione casella fallita"
      err.displayMessage = `[${data.code}] ${data.error}${data.detail ? ' — ' + data.detail : ''}`
    } else {
      err.displayMessage = data?.error || err.message || 'Errore sconosciuto'
    }

    return Promise.reject(err)
  }
)

export default api
