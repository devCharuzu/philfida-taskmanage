import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DirectorPage  from './pages/DirectorPage'
import UnitHeadPage  from './pages/UnitHeadPage'

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
        .select('ID, Name, Email, Role, Unit, Office, ProfilePic, Status, AccountStatus, Designation')
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
      if (user.Name !== existingSession.Name ||
          user.Role !== existingSession.Role ||
          user.Email !== existingSession.Email) {
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
    .select('ID, Name, Email, Role, Unit, Office, ProfilePic, Status, AccountStatus, Designation')
    .eq('Email', email)
    .maybeSingle()

  if (userError || !users) {
    await supabase.auth.signOut()
    return
  }

  useStore.getState().setSession({
    ID: users.ID, Name: users.Name, Email: users.Email, Role: users.Role,
    Unit: users.Unit, Office: users.Office, ProfilePic: users.ProfilePic,
    Status: users.Status, AccountStatus: users.AccountStatus, Designation: users.Designation
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
    } catch {
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

  console.log('[PROTECTED] ProtectedRoute render:', { hydrated, session, role })

  if (!hydrated) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium">Loading TaskFlow...</p>
      <p className="text-green-200 text-xs mt-2">Please wait</p>
      {error && (
        <div className="mt-4 bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-3 max-w-md">
          <p className="text-yellow-200 text-xs">{error}</p>
        </div>
      )}
    </div>
  )

  if (!session) {
    console.log('[PROTECTED] No session, redirecting to login')
    return <Navigate to="/" replace />
  }
  if (role && session.Role !== role) {
    console.log('[PROTECTED] Role mismatch, redirecting to login')
    return <Navigate to="/" replace />
  }
  console.log('[PROTECTED] Access granted')
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
      <p className="text-white text-sm font-medium">Loading TaskFlow...</p>
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
    if (session.Role === 'Unit Head')      return <Navigate to="/unithead"  replace />
    return <Navigate to="/dashboard" replace />
  }

  return <LoginPage />
}


export default function App() {
  const { hydrated, error } = useHydrated()

  return (
    <Routes>
      <Route path="/"          element={<LoginRoute hydrated={hydrated} error={error} />} />
      <Route path="/dashboard" element={<ProtectedRoute hydrated={hydrated} error={error}><DashboardPage /></ProtectedRoute>} />
      <Route path="/unithead"  element={<ProtectedRoute role="Unit Head" hydrated={hydrated} error={error}><UnitHeadPage /></ProtectedRoute>} />
      <Route path="/director"  element={<ProtectedRoute role="Director" hydrated={hydrated} error={error}><DirectorPage /></ProtectedRoute>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}