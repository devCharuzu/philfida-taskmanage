import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DirectorPage  from './pages/DirectorPage'
import UnitHeadPage  from './pages/UnitHeadPage'

// Initialize session from Supabase - moved outside useEffect for scope
let isInitializing = false

async function initializeSession() {
  // Prevent concurrent initialization
  if (isInitializing) {
    console.log('[AUTH] Session initialization already in progress, skipping')
    return
  }
  
  isInitializing = true
  
  try {
    console.log('[AUTH] Initializing session...')
    console.log('[AUTH] Current store state:', useStore.getState())
    
    // First, check if we already have a session in the store (from localStorage persistence)
    const existingSession = useStore.getState().session
    console.log('[AUTH] Existing session in store:', existingSession)
    
    if (existingSession) {
      console.log('[AUTH] Session already in store from localStorage, using it:', existingSession)
      // Validate the session is still active by checking AccountStatus
      try {
        const { data: user, error: userError } = await supabase
          .from('Users')
          .select('AccountStatus')
          .eq('ID', existingSession.ID)
          .single()
        
        if (userError || !user) {
          console.warn('[AUTH] Failed to validate session, clearing it:', userError)
          useStore.getState().clearSession()
          return
        }
        
        if (user.AccountStatus === 'Deactivated') {
          console.warn('[AUTH] Account is deactivated, clearing session')
          useStore.getState().clearSession()
          return
        }
        
        if (user.AccountStatus === 'Pending') {
          console.warn('[AUTH] Account is pending approval, clearing session')
          useStore.getState().clearSession()
          return
        }
        
        console.log('[AUTH] Session validated, keeping it')
        return
      } catch (validationError) {
        console.error('[AUTH] Session validation failed:', validationError)
        // Keep the session anyway if validation fails (network issues, etc.)
        return
      }
    }
    
    console.log('[AUTH] No session in store, checking Supabase auth...')
    // If no session in store, try to get it from Supabase
    const { data: { session }, error } = await supabase.auth.getSession()
    console.log('[AUTH] Supabase session result:', { session, error })
    
    if (error) {
      console.error('[AUTH] Session initialization error:', error)
      return
    }
    
    if (!session) {
      console.log('[AUTH] No session found in Supabase or localStorage')
      return
    }
    
    console.log('[AUTH] Supabase session found, fetching user data...')
    // Get user details from database using email (not UUID, since Users table uses custom TEXT IDs)
    const email = session.user.email?.toLowerCase().trim()
    if (!email) {
      console.error('[AUTH] No email in Supabase session')
      return
    }

    const { data: users, error: userError } = await supabase
      .from('Users')
      .select('*')
      .eq('Email', email)
      .single()

    console.log('[AUTH] User data fetch result:', { users, userError })

    if (userError) {
      console.error('[AUTH] User data fetch error:', userError)
      // Sign out from Supabase to prevent loop
      await supabase.auth.signOut()
      isInitializing = false
      return
    }

    if (!users) {
      console.log('[AUTH] User not found in database with email:', email)
      // Sign out from Supabase to prevent loop
      await supabase.auth.signOut()
      isInitializing = false
      return
    }

    // Clear any fake localStorage data if it exists
    try {
      const localStorageContent = localStorage.getItem('philfida_session')
      if (localStorageContent) {
        const parsed = JSON.parse(localStorageContent)
        if (parsed?.state?.session?.ID === '001') {
          console.warn('[AUTH] Clearing fake test data from localStorage')
          localStorage.removeItem('philfida_session')
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    
    const userSession = {
      ID: users.ID,
      Name: users.Name,
      Email: users.Email,
      Role: users.Role,
      Unit: users.Unit,
      Office: users.Office,
      ProfilePic: users.ProfilePic,
      Status: users.Status,
      AccountStatus: users.AccountStatus,
      Designation: users.Designation
    }
    
    useStore.getState().setSession(userSession)
    console.log('[AUTH] Session restored from Supabase:', userSession)
  } catch (error) {
    console.error('[AUTH] Failed to initialize session:', error)
  } finally {
    isInitializing = false
  }
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState(null)
  const setSession = useStore(s => s.setSession)
  
  useEffect(() => {
    console.log('[HYDRATE] useHydrated effect running')
    
    // Check localStorage directly
    try {
      const localStorageContent = localStorage.getItem('philfida_session')
      console.log('[HYDRATE] localStorage content:', localStorageContent)
      if (localStorageContent) {
        const parsed = JSON.parse(localStorageContent)
        console.log('[HYDRATE] Parsed localStorage session:', parsed)
      }
    } catch (e) {
      console.error('[HYDRATE] Failed to read localStorage:', e)
    }
    
    // Check if already hydrated first
    let isAlreadyHydrated = false
    try {
      isAlreadyHydrated = useStore.persist.hasHydrated()
      console.log('[HYDRATE] isAlreadyHydrated:', isAlreadyHydrated)
    } catch (e) {
      console.error('Store hydration check failed:', e)
      setError('Store hydration failed')
      setHydrated(true)
      return
    }
    
    if (isAlreadyHydrated) {
      setHydrated(true)
      console.log('[HYDRATE] Store already hydrated, initializing session...')
      // Initialize session even if store was already hydrated
      initializeSession()
      return
    }
    
    // Add timeout to prevent infinite loading on mobile
    const timeout = setTimeout(() => {
      console.warn('[HYDRATE] Store hydration timeout - forcing render')
      setError('Hydration timeout - some features may not work correctly')
      setHydrated(true)
    }, 5000)

    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timeout)
      setError(null)
      setHydrated(true)
      console.log('[HYDRATE] Store hydrated, initializing session...')
      // Initialize session after store is hydrated
      initializeSession()
    })
    
    return () => {
      clearTimeout(timeout)
      unsub?.()
    }
  }, []) // Empty dependency array to prevent re-renders
  
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