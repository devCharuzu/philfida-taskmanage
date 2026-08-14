import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import { ensureServiceWorker, permissionState, getSubscription, subscribeToPush } from './lib/notifications'
import { savePushSubscription } from './lib/api'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DirectorPage  from './pages/DirectorPage'
import RecordsPage   from './pages/RecordsPage'
import UnitHeadPage  from './pages/UnitHeadPage'
import AnnouncementPopup from './components/AnnouncementPopup'

/**
 * Restores Google session from Supabase Auth, or revalidates persisted Personnel-ID session.
 * Does not clear persisted session on transient DB/network errors (avoids prod refresh → login).
 */
async function runSessionBootstrap() {
  const existingSession = useStore.getState().session

  if (existingSession?.ID) {
    try {
      const { data: user, error: userError } = await supabase
        .from('Users')
        .select('ID, Name, Email, Role, Unit, Office, ProfilePic, Status, AccountStatus, Designation, Region')
        .eq('ID', existingSession.ID)
        .maybeSingle()

      if (userError) {
        console.warn('[AUTH] Session revalidate skipped (keeping local session):', userError.message)
        return
      }
      if (!user) {
        useStore.getState().clearSession()
        return
      }
      if (user.AccountStatus === 'Deactivated' || user.AccountStatus === 'Pending') {
        useStore.getState().clearSession()
        return
      }
      // H11 FIX: Deep check all fields to ensure persistence of status/region on refresh
      const hasChanges = 
          user.Name !== existingSession.Name ||
          user.Role !== existingSession.Role ||
          user.Email !== existingSession.Email ||
          user.Status !== existingSession.Status ||
          user.Region !== existingSession.Region ||
          user.Designation !== existingSession.Designation

      if (hasChanges) {
        useStore.getState().setSession({ ...existingSession, ...user })
      }
    } catch (e) {
      console.warn('[AUTH] Session revalidate error (keeping local session):', e)
    }
    return
  }

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) return

  const email = session.user.email?.toLowerCase().trim()
  if (!email) return

  const { data: users, error: userError } = await supabase
    .from('Users')
    .select('ID, Name, Email, Role, Unit, Office, ProfilePic, Status, AccountStatus, Designation, Region')
    .eq('Email', email)
    .maybeSingle()

  if (userError || !users) {
    await supabase.auth.signOut()
    return
  }

  useStore.getState().setSession({
    ID: users.ID, Name: users.Name, Email: users.Email, Role: users.Role,
    Unit: users.Unit, Office: users.Office, ProfilePic: users.ProfilePic,
    Status: users.Status, AccountStatus: users.AccountStatus, Designation: users.Designation,
    Region: users.Region
  })
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  const [error, setError]       = useState(null)
  const bootstrapLockRef = useRef(null)

  useEffect(() => {
    const startBootstrap = () => {
      if (bootstrapLockRef.current) return bootstrapLockRef.current
      bootstrapLockRef.current = runSessionBootstrap()
        .catch((e) => console.error('[AUTH] Bootstrap failed:', e))
        .finally(() => { bootstrapLockRef.current = null })
      return bootstrapLockRef.current
    }

    let isAlreadyHydrated = false
    try {
      isAlreadyHydrated = useStore.persist.hasHydrated()
    } catch (error) {
      setError('Store hydration failed')
      setHydrated(true)
      return
    }

    if (isAlreadyHydrated) {
      setHydrated(true)
      void startBootstrap()
      return
    }

    const timeout = setTimeout(() => {
      setError('Hydration timeout - some features may not work correctly')
      setHydrated(true)
    }, 5000)

    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timeout)
      setError(null)
      setHydrated(true)
      void startBootstrap()
    })

    return () => { clearTimeout(timeout); unsub?.() }
  }, [])

  return { hydrated, error }
}

function ProtectedRoute({ children, role, hydrated, error }) {
  const session  = useStore(s => s.session)

  if (!hydrated) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium">Loading Task Management System...</p>
      <p className="text-green-200 text-xs mt-2">Please wait</p>
      {error && (
        <div className="mt-4 bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-3 max-w-md">
          <p className="text-yellow-200 text-xs">{error}</p>
        </div>
      )}
    </div>
  )

  if (!session) {
    return <Navigate to="/" replace />
  }
  if (role && session.Role !== role) {
    return <Navigate to="/" replace />
  }
  return children
}

// The login route — also handles OAuth callbacks
// If there's a ?code= in the URL it's always an OAuth callback regardless of session
function LoginRoute({ hydrated, error }) {
  const location = useLocation()
  const session  = useStore(s => s.session)

  const isOAuthCallback = location.search.includes('code=') ||
                          location.hash.includes('access_token')

  // Always show LoginPage for OAuth callbacks so it can process the code
  if (isOAuthCallback) return <LoginPage />

  if (!hydrated) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium">Loading Task Management System...</p>
      <p className="text-green-200 text-xs mt-2">Please wait</p>
      {error && (
        <div className="mt-4 bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-3 max-w-md">
          <p className="text-yellow-200 text-xs">{error}</p>
        </div>
      )}
    </div>
  )

  // Already logged in — redirect to their dashboard
  if (session) {
    if (session.Role === 'Director')       return <Navigate to="/director"  replace />
    if (session.Role === 'Records')        return <Navigate to="/records"   replace />
    if (session.Role === 'Unit Head')      return <Navigate to="/unithead"  replace />
    return <Navigate to="/dashboard" replace />
  }

  return <LoginPage />
}


const IDLE_LIMIT_MS = 30 * 60 * 1000
const IDLE_KEY = 'philfida_last_activity'

async function forceLogout() {
  await supabase.auth.signOut().catch(() => {})
  useStore.getState().clearSession()
  localStorage.removeItem('philfida_session')
  localStorage.removeItem(IDLE_KEY)
  window.location.href = '/'
}

/** Logs every role out after 30 min with no interaction. Timestamp lives in localStorage so
 *  the countdown survives reloads and is shared across tabs. */
function useIdleLogout() {
  const session = useStore(s => s.session)

  useEffect(() => {
    if (!session) return

    const touch = () => localStorage.setItem(IDLE_KEY, String(Date.now()))
    const last = Number(localStorage.getItem(IDLE_KEY))
    if (last && Date.now() - last > IDLE_LIMIT_MS) { forceLogout(); return }
    touch()

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, touch, { passive: true }))

    // ponytail: 30s poll instead of a rescheduled timer — cheap, and it also catches sleep/wake.
    const id = setInterval(() => {
      const t = Number(localStorage.getItem(IDLE_KEY))
      if (t && Date.now() - t > IDLE_LIMIT_MS) forceLogout()
    }, 30_000)

    return () => {
      events.forEach(e => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [session])
}

export default function App() {
  const { hydrated, error } = useHydrated()
  useIdleLogout()

  const sessionId = useStore(s => s.session?.ID)
  useEffect(() => {
    ensureServiceWorker()
  }, [])

  // Keep this device's subscription attached to the current user. Only runs
  // once permission is already granted — never prompts here (Settings does).
  useEffect(() => {
    if (!sessionId || permissionState() !== 'granted') return
    let alive = true
    getSubscription()
      .then(existing => (existing ? existing.toJSON() : subscribeToPush()))
      .then(sub => { if (alive && sub) savePushSubscription(sessionId, sub) })
      .catch(() => {})
    return () => { alive = false }
  }, [sessionId])

  const session = useStore(s => s.session)

  // Mounted once here rather than per page, so the popup appears on whichever
  // dashboard the person lands on after signing in.
  const goToAnnouncements = (announcementId) => {
    // Each role page keeps its own tab state, so ask it to switch via an event
    // rather than lifting that state up for a single interaction. The id is
    // handed over through sessionStorage because the tab mounts *after* this
    // event fires — an event payload alone would arrive before any listener.
    try { sessionStorage.setItem('philfida_open_announcement', String(announcementId ?? '')) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('open-announcements'))
  }

  return (
    <>
    {session && <AnnouncementPopup onOpenAnnouncements={goToAnnouncements} />}
    <Routes>
      <Route path="/"          element={<LoginRoute hydrated={hydrated} error={error} />} />
      <Route path="/dashboard" element={<ProtectedRoute hydrated={hydrated} error={error}><DashboardPage /></ProtectedRoute>} />
      <Route path="/unithead"  element={<ProtectedRoute role="Unit Head" hydrated={hydrated} error={error}><UnitHeadPage /></ProtectedRoute>} />
      <Route path="/director"  element={<ProtectedRoute role="Director" hydrated={hydrated} error={error}><DirectorPage /></ProtectedRoute>} />
      <Route path="/records"   element={<ProtectedRoute role="Records" hydrated={hydrated} error={error}><RecordsPage /></ProtectedRoute>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}