import { useEffect, useRef, useState } from 'react'
import { api, hasToken, post, get, setToken } from '../consoleApi.js'
import { offlineCall } from '../offline.js'

export default function useInstitutionData({ onAuthFailure }) {
  const [phase, setPhase] = useState('boot')
  const [offline, setOffline] = useState(false)

  const [role, setRole] = useState('branchmgr')
  const roleRef = useRef(role)
  roleRef.current = role

  const [user, setUser] = useState('')
  const [D, setD] = useState(null)
  const [Q, setQ] = useState(null)
  const [msg, setMsg] = useState({})

  const off = useRef(false)

  // API request handler
  const X = (method, path, b) => (
    off.current
      ? Promise.resolve().then(() =>
          offlineCall(roleRef.current, method, path, b)
        )
      : (
          method === 'GET'
            ? get(path)
            : post(path, b)
        )
  )

  const say = (k, text, kind = 'ok') =>
    setMsg((m) => ({
      ...m,
      [k]: { text, kind }
    }))

  const run = (k, fn) =>
    fn().catch((e) => say(k, e.message, 'bad'))

  // Load institution dashboard data
  const load = async () => {
    const [d, q] = await Promise.all([
      X('GET', '/api/portal/institution'),
      X('GET', '/api/portal/staff/queue')
    ])

    setD(d)
    setQ(q)
  }

  // Refresh data after an action
  const act = (k, fn) =>
    run(k, async () => {
      const r = await fn()
      await load()

      if (r) {
        say(k, r.text, r.kind)
      }
    })

  // Offline demonstration mode
  const goOffline = async () => {
    off.current = true
    setOffline(true)
    await load()
    setPhase('ready')
  }

  // Offline-only role switcher
  const switchRole = (r) => {
    setRole(r)
    roleRef.current = r
    setMsg({})
    load()
  }

  const signOut = () => {
    setToken(null)
    setD(null)
    setQ(null)
    onAuthFailure?.()
  }

  // Validate the staff session established by UnifiedLogin
  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      try {
        if (!hasToken()) {
          onAuthFailure?.()
          return
        }

        const r = await api.me()

        if (cancelled) return

        if (r?.user && r.user.role !== 'customer') {
          setRole(r.user.role)
          setUser(r.user.name)

          await load()

          if (!cancelled) {
            setPhase('ready')
          }

          return
        }

        setToken(null)
        onAuthFailure?.()
      } catch (e) {
        if (cancelled) return

        if (e.offline) {
          try {
            await goOffline()
          } catch {
            if (!cancelled) {
              setPhase('error')
            }
          }
        } else {
          setToken(null)
          onAuthFailure?.()
        }
      }
    }

    initialize()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    phase,
    offline,
    role,
    user,
    D,
    Q,
    msg,
    setMsg,
    X,
    say,
    run,
    act,
    switchRole,
    signOut
  }
}