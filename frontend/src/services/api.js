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

// Handle 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mv_token')
      localStorage.removeItem('mv_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
