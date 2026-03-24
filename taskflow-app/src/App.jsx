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
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true))
    if (useStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [])
  return hydrated
}

function ProtectedRoute({ children, role }) {
  const hydrated = useHydrated()
  const session  = useStore(s => s.session)

  if (!hydrated) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f0' }}>
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f0' }}>
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
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