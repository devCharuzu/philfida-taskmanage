import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DirectorPage  from './pages/DirectorPage'
import UnitHeadPage  from './pages/UnitHeadPage'
import PersonalCalendarPage from './pages/PersonalCalendarPage'

function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // Add timeout to prevent infinite loading on mobile
    const timeout = setTimeout(() => {
      console.warn('Store hydration timeout - forcing render')
      setHydrated(true)
    }, 3000) // 3 second timeout for mobile

    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timeout)
      setHydrated(true)
    })
    
    if (useStore.persist.hasHydrated()) {
      clearTimeout(timeout)
      setHydrated(true)
    }
    
    return () => {
      clearTimeout(timeout)
      unsub?.()
    }
  }, [])
  return hydrated
}

function ProtectedRoute({ children, role }) {
  const hydrated = useHydrated()
  const session  = useStore(s => s.session)

  if (!hydrated) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium">Loading TaskFlow...</p>
      <p className="text-green-200 text-xs mt-2">Please wait</p>
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
  const hydrated = useHydrated()

  const isOAuthCallback = location.search.includes('code=') ||
                          location.hash.includes('access_token')

  // Always show LoginPage for OAuth callbacks so it can process the code
  if (isOAuthCallback) return <LoginPage />

  if (!hydrated) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium">Loading TaskFlow...</p>
      <p className="text-green-200 text-xs mt-2">Please wait</p>
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
      <Route path="/calendar"   element={<ProtectedRoute><PersonalCalendarPage /></ProtectedRoute>} />
      <Route path="/director"  element={<ProtectedRoute role="Director"><DirectorPage /></ProtectedRoute>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}