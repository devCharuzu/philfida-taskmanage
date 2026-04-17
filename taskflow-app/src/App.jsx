import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DirectorPage  from './pages/DirectorPage'
import UnitHeadPage  from './pages/UnitHeadPage'

// Initialize session from Supabase - moved outside useEffect for scope
let sessionInitialized = false
async function initializeSession() {
  if (sessionInitialized) {
    console.log('Session already initialized, skipping...')
    return
  }
  
  try {
    console.log('Initializing session...')
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Session initialization error:', error)
      return
    }
    
    if (!session) {
      console.log('No session found in Supabase')
      sessionInitialized = true
      return
    }
    
    // Get user details from database - try both ID and email matching for Google OAuth
    let users = null
    let userError = null
    
    // First try by ID (for manual login users)
    const { data: usersById, error: idError } = await supabase
      .from('Users')
      .select('*')
      .eq('ID', session.user.id)
      .single()
    
    if (!idError && usersById) {
      users = usersById
    } else {
      // Try by email (for Google OAuth users)
      const { data: usersByEmail, error: emailError } = await supabase
        .from('Users')
        .select('*')
        .eq('Email', session.user.email)
        .single()
      
      if (!emailError && usersByEmail) {
        users = usersByEmail
      } else {
        userError = idError || emailError
      }
    }
    
    if (userError) {
      console.error('User data fetch error:', userError)
      sessionInitialized = true
      return
    }
    
    if (!users) {
      console.error('User not found in database')
      sessionInitialized = true
      return
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
    
    // Validate user session before setting
    if (!userSession.AccountStatus || userSession.AccountStatus === 'Pending') {
      console.warn('User account is pending or inactive, clearing session')
      useStore.getState().clearSession()
      await supabase.auth.signOut()
    } else if (userSession.AccountStatus === 'Deactivated') {
      console.warn('User account is deactivated, clearing session')
      useStore.getState().clearSession()
      await supabase.auth.signOut()
    } else {
      useStore.getState().setSession(userSession)
      console.log('Session restored from Supabase:', userSession)
    }
    sessionInitialized = true
  } catch (error) {
    console.error('Failed to initialize session:', error)
    sessionInitialized = true
  }
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState(null)
  const setSession = useStore(s => s.setSession)
  
  useEffect(() => {
    // Set up session refresh listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email)
      
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing session')
        useStore.getState().clearSession()
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed, session is valid')
      } else if (event === 'SIGNED_IN' && session) {
        console.log('User signed in, initializing session')
        await initializeSession()
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])
  
  useEffect(() => {
    // Check if already hydrated first
    let isAlreadyHydrated = false
    try {
      isAlreadyHydrated = useStore.persist.hasHydrated()
    } catch (e) {
      console.error('Store hydration check failed:', e)
      setError('Store hydration failed')
      setHydrated(true)
      return
    }
    
    if (isAlreadyHydrated) {
      setHydrated(true)
      console.log('Store already hydrated')
      return
    }
    
    // Add timeout to prevent infinite loading on mobile
    const timeout = setTimeout(() => {
      console.warn('Store hydration timeout - forcing render')
      setError('Hydration timeout - some features may not work correctly')
      setHydrated(true)
    }, 5000)

    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timeout)
      setError(null)
      setHydrated(true)
      console.log('Store hydrated, initializing session...')
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

function ProtectedRoute({ children, role }) {
  const { hydrated, error } = useHydrated()
  const session  = useStore(s => s.session)

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

  if (!session)                      return <Navigate to="/" replace />
  if (role && session.Role !== role) return <Navigate to="/" replace />
  return children
}

// The login route — also handles OAuth callbacks
// If there's a ?code= in the URL it's always an OAuth callback regardless of session
function LoginRoute() {
  const location = useLocation()
  const session  = useStore(s => s.session)
  const { hydrated, error } = useHydrated()

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
  return (
    <Routes>
      <Route path="/"          element={<LoginRoute />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/unithead"  element={<ProtectedRoute role="Unit Head"><UnitHeadPage /></ProtectedRoute>} />
      <Route path="/director"  element={<ProtectedRoute role="Director"><DirectorPage /></ProtectedRoute>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}