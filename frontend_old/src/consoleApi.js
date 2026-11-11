// HTTP client for the institution console (talks to the Django portal app).
const BASE = import.meta.env.VITE_API_BASE || ''
const KEY = 'vestro_staff_token'

export const hasToken = () => !!localStorage.getItem(KEY)
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY))

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem(KEY)
  if (t) headers.Authorization = `Bearer ${t}`
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }
  let data = null
  try { data = await res.json() } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401) setToken(null)
    const err = new Error((data && (data.detail || data.message || data.error)) || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const get = (path) => request('GET', path)
export const post = (path, body) => request('POST', path, body ?? {})

export const api = {
  demo: () => get('/api/portal/demo'),
  login: (username, password) => post('/api/portal/login', { username, password }),
  me: () => get('/api/portal/me'),
}