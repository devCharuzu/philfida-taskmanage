import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getAllUsers, registerUser, signInWithGoogle, handleGoogleCallback, UNITS, OFFICES } from '../lib/api'

export default function LoginPage() {
  const [tab,         setTab]         = useState('login')
  const [loginId,     setLoginId]     = useState('')
  const [loginPass,   setLoginPass]   = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [regId,       setRegId]       = useState('')
  const [regName,     setRegName]     = useState('')
  const [regEmail,    setRegEmail]    = useState('')
  const [regUnit,     setRegUnit]     = useState('')
  const [regRole,     setRegRole]     = useState('Employee')
  const [regPass,     setRegPass]     = useState('')
  const [showRegPass, setShowRegPass] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [connectionError, setConnectionError] = useState('')

  const setSession    = useStore(s => s.setSession)
  const navigate   = useNavigate()
  const oauthHandledRef = useRef(false)

  // Check Supabase connection on component mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('Users').select('count').limit(1)
        if (error) {
          if (error.message?.includes('Legacy API keys are disabled')) {
            setConnectionError(`
Supabase Connection Error: Legacy API Keys Disabled

Your Supabase project has disabled legacy API keys. This prevents the app from connecting to the database.

To fix this issue:

OPTION 1: Re-enable Legacy Keys (Quick Fix)
1. Go to your Supabase Dashboard
2. Navigate to Settings > API  
3. Scroll down to "Legacy API Keys" section
4. Click "Re-enable legacy API keys"

OPTION 2: Update to New Keys (Recommended)
1. In Supabase Dashboard > Settings > API
2. Find the "New API Keys" section  
3. Copy the new "Publishable" key
4. Update your .env.local file with the new key

The application cannot function until this is resolved.
            `)
          } else {
            setConnectionError(`Database connection error: ${error.message}`)
          }
        }
      } catch (e) {
        setConnectionError(`Failed to connect to database: ${e.message}`)
      }
    }
    
    checkConnection()
  }, [])

  // ── Handle Google OAuth redirect callback ───────────────────
  useEffect(() => {
    // Only run if this looks like an OAuth callback (has code or token in URL)
    const hashQ = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    const hashParams = new URLSearchParams(hashQ)
    const isCallback = window.location.search.includes('code=') ||
                       hashQ.includes('code=') ||
                       window.location.hash.includes('access_token')
    if (!isCallback) return
    if (oauthHandledRef.current) return
    oauthHandledRef.current = true

    const sp = new URLSearchParams(window.location.search)
    const oauthErr = sp.get('error')
    const oauthErrDesc = sp.get('error_description')

    if (oauthErr) {
      setGoogleLoading(true)
      window.history.replaceState({}, document.title, window.location.pathname)
      setError(oauthErrDesc || oauthErr)
      setGoogleLoading(false)
      return
    }

    setGoogleLoading(true)

    async function processCallback() {
      // Wait briefly for Supabase to initialize and detect the PKCE callback.
      await new Promise(r => setTimeout(r, 200))
      window.history.replaceState({}, document.title, window.location.pathname)

      // Retry up to 5 times with 1s delay — allow session / app user row to settle
      let result = null
      for (let i = 0; i < 5; i++) {
        result = await handleGoogleCallback()
        if (result) break
        await new Promise(r => setTimeout(r, 1000))
      }

      if (!result) {
        setError('Google sign-in completed but app could not establish session. Verify redirect URI in Supabase and Google OAuth settings, then try again.')
        setGoogleLoading(false)
        return
      }

      const { user, isNew } = result
      if (isNew) {
        setSuccess('Your Google account has been submitted for approval. The Director will review your account before you can log in.')
        setGoogleLoading(false)
        return
      }
      if (user.AccountStatus === 'Pending')     { setError('Your account is pending approval by the Director.'); setGoogleLoading(false); return }
      if (user.AccountStatus === 'Deactivated') { setError('Your account has been deactivated. Contact the Director.'); setGoogleLoading(false); return }

      const needsSetup = !user.Designation && !user.Unit && !user.Office
      setSession({ ...user, _needsProfileSetup: needsSetup })
      if (user.Role === 'Director')       navigate('/director')
      else if (user.Role === 'Unit Head') navigate('/unithead')
      else                                navigate('/dashboard')
    }

    void processCallback()
  }, [])

  // ── Manual login ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const users = await getAllUsers()
      const user  = users.find(u => String(u.ID) === loginId.trim() && u.Password === loginPass)
      if (!user)                              { setError('Invalid Personnel ID or Password.'); return }
      if (user.AccountStatus === 'Pending')   { setError('Your account is pending approval by the Director.'); return }
      if (user.AccountStatus === 'Deactivated') { setError('Your account has been deactivated. Contact the Director.'); return }
      setSession(user)
      if (user.Role === 'Director')        navigate('/director')
      else if (user.Role === 'Unit Head')  navigate('/unithead')
      else                                 navigate('/dashboard')
    } catch { setError('Connection error. Please try again.') }
    finally  { setLoading(false) }
  }

  // ── Google sign in ──────────────────────────────────────────
  async function handleGoogleSignIn() {
    setGoogleLoading(true); setError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(`Could not connect to Google. ${e?.message || ''} Please try again.`)
      setGoogleLoading(false)
    }
  }

  // ── Register ────────────────────────────────────────────────
  async function handleRegister(e) {
    e.preventDefault()
    if (!regId || !regName || !regUnit || !regRole || !regPass) { setError('All fields are required.'); return }
    setLoading(true); setError('')
    try {
      const result = await registerUser({ id: regId.trim(), name: regName, email: regEmail, unit: regUnit, role: regRole, pass: regPass })
      if (result === 'SUCCESS') {
        setSuccess('Registration submitted! Your account is pending approval by the Director.')
        setTab('login')
        setRegId(''); setRegName(''); setRegEmail(''); setRegUnit(''); setRegRole('Employee'); setRegPass('')
      } else if (result === 'EXISTS') {
        setError('This Personnel ID is already registered.')
      }
    } catch { setError('Registration failed. Please try again.') }
    finally  { setLoading(false) }
  }

  function switchTab(t) { setTab(t); setError(''); setSuccess('') }

  if (googleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
        {/* Animated background elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-400/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-400/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl animate-pulse delay-500" />
        </div>

        <div className="relative z-10 text-center">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white font-semibold text-lg">Signing in with Google...</p>
          <p className="text-green-200 text-sm mt-2">Please wait while we verify your account</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-y-auto"
      style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>

      {/* Animated background elements */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-green-400/8 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-yellow-400/8 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-blue-400/8 rounded-full blur-3xl animate-pulse delay-500" />
        <div className="absolute top-1/4 right-1/4 w-48 h-48 bg-emerald-400/6 rounded-full blur-2xl animate-pulse delay-700" />
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex items-start justify-center p-4 py-8">

        {/* Login Card */}
        <div className="w-full max-w-[320px] sm:max-w-[360px] md:max-w-[400px] lg:max-w-[440px] xl:max-w-[480px]">

          {/* Header with logos */}
          <div className="text-center mb-8">
            <div className="flex justify-center items-center gap-4 mb-6">
              {/* DA Logo */}
              <div className="w-10 h-10 lg:w-12 lg:h-14 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Bagong_Pilipinas_logo_%28DA%29.svg/200px-Bagong_Pilipinas_logo_%28DA%29.svg.png"
                  alt="Department of Agriculture" className="w-6 h-6 lg:w-8 lg:h-10 object-contain"
                  onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<div class="w-6 h-6 lg:w-8 lg:h-8 bg-yellow-400 rounded-full flex items-center justify-center"><span class="text-xs font-bold text-green-800">DA</span></div>' }} />
              </div>

              {/* PhilFIDA Logo */}
              <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-white shadow-xl flex items-center justify-center overflow-hidden p-2">
                <img src="/philfida-logo.png" alt="PhilFIDA" className="w-full h-full object-contain"
                  onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<div class="text-center"><span class="text-lg lg:text-xl font-bold text-green-800">PhilFIDA</span></div>' }} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-green-200 text-xs font-semibold uppercase tracking-widest">Republic of the Philippines</p>
              <h1 className="text-white font-bold text-lg lg:text-xl xl:text-2xl leading-tight">
                Philippine Fiber Industry<br />
                <span className="text-yellow-300">Development Authority</span>
              </h1>
              <p className="text-green-200 text-xs lg:text-sm font-medium mt-2">TaskFlow Management System</p>
            </div>
          </div>

          {/* Main Card */}
          <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">

            {/* Tab switcher */}
            <div className="flex bg-slate-50/80 border-b border-slate-200/50">
              <button onClick={() => switchTab('login')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  tab === 'login'
                    ? 'bg-white text-green-800 shadow-sm border-b-2 border-green-600'
                    : 'text-slate-600 hover:text-green-700 hover:bg-white/50'
                }`}>
                Sign In
              </button>
              <button onClick={() => switchTab('register')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  tab === 'register'
                    ? 'bg-white text-green-800 shadow-sm border-b-2 border-green-600'
                    : 'text-slate-600 hover:text-green-700 hover:bg-white/50'
                }`}>
                Register
              </button>
            </div>

            {/* Form content */}
            <div className="p-4 sm:p-6 lg:p-8 bg-white rounded-xl border border-slate-200 shadow-sm">

              {/* Alerts */}
              {connectionError && (
                <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-0.5 text-red-600" />
                    <div className="text-sm">
                      <pre className="whitespace-pre-wrap font-sans">{connectionError}</pre>
                    </div>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
                  <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3 mb-6">
                  <i className="bi bi-check-circle-fill flex-shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              {/* SIGN IN TAB */}
              {tab === 'login' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-2">Welcome Back</h2>
                    <p className="text-slate-600 text-xs lg:text-sm">Sign in to access your dashboard</p>
                  </div>

                  {/* Google Sign In */}
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl py-3 px-4 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-60"
                  >
                    <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
                      <path d="M47.532 24.552c0-1.636-.147-3.2-.42-4.704H24v8.898h13.204c-.568 3.072-2.292 5.676-4.884 7.42v6.168h7.908c4.624-4.26 7.304-10.54 7.304-17.782z" fill="#4285F4"/>
                      <path d="M24 48c6.636 0 12.204-2.196 16.272-5.952l-7.908-6.168c-2.196 1.476-5.004 2.34-8.364 2.34-6.432 0-11.88-4.344-13.824-10.176H2.016v6.372C6.072 42.9 14.448 48 24 48z" fill="#34A853"/>
                      <path d="M10.176 28.044A14.88 14.88 0 019.396 24c0-1.392.24-2.748.672-4.02v-6.372H2.016A23.988 23.988 0 000 24c0 3.876.936 7.548 2.016 10.392l8.16-6.348z" fill="#FBBC05"/>
                      <path d="M24 9.54c3.624 0 6.876 1.248 9.432 3.696l7.08-7.08C36.192 2.196 30.636 0 24 0 14.448 0 6.072 5.1 2.016 13.608l8.16 6.372C12.12 13.884 17.568 9.54 24 9.54z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-slate-500 font-medium">or sign in with ID</span>
                    </div>
                  </div>

                  {/* Manual login form */}
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                      <label className="block text-sm lg:text-base font-semibold text-slate-700 mb-2 lg:mb-3">Personnel ID</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <i className="bi bi-person-fill text-sm" />
                        </div>
                        <input
                          type="text"
                          className="w-full px-4 py-3 lg:py-5 bg-white border-2 border-slate-200 rounded-xl text-sm lg:text-lg font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                          style={{ paddingLeft: '3rem' }}
                          placeholder="Enter your Personnel ID"
                          value={loginId}
                          onChange={e => setLoginId(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleLogin()}
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm lg:text-base font-semibold text-slate-700 mb-2 lg:mb-3">Password</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <i className="bi bi-lock-fill text-sm" />
                        </div>
                        <input
                          className="w-full pl-12 pr-12 py-3 lg:py-5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm lg:text-lg"
                          type={showPass ? 'text' : 'password'}
                          placeholder="Enter your password"
                          value={loginPass}
                          onChange={e => setLoginPass(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'} text-sm`} />
                        </button>
                      </div>
                    </div>

                    <button
                      className="w-full py-4 lg:py-6 px-6 lg:px-8 text-white font-bold text-sm lg:text-lg rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #155414, #1e6e1e)' }}
                      disabled={loading}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        'Sign In'
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* REGISTER TAB */}
              {tab === 'register' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-2">Create Account</h2>
                    <p className="text-slate-600 text-xs lg:text-sm">Submit your registration for approval</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <i className="bi bi-info-circle-fill text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium mb-1">Account Approval Required</p>
                        <p>Your account will be reviewed by the Director before you can log in. You can also register with Google to skip entering a password.</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                        <input
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                          placeholder="Juan dela Cruz"
                          value={regName}
                          onChange={e => setRegName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Personnel ID</label>
                        <input
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                          placeholder="e.g. 001"
                          value={regId}
                          onChange={e => setRegId(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address <span className="text-slate-400 font-normal">(Optional)</span></label>
                      <input
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                        type="email"
                        placeholder="juan@philfida.gov.ph"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">{regRole === 'Director' ? 'Office' : 'Unit'}</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                          value={regUnit}
                          onChange={e => setRegUnit(e.target.value)}
                          required
                        >
                          <option value="">-- Select {regRole === 'Director' ? 'Office' : 'Unit'} --</option>
                          {(regRole === 'Director' ? OFFICES : UNITS).map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                          value={regRole}
                          onChange={e => { setRegRole(e.target.value); setRegUnit('') }}
                          required
                        >
                          <option value="Employee">Unit Personnel</option>
                          <option value="Unit Head">Unit Head</option>
                          <option value="Director">Director</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-slate-700 mb-3">Password</label>
                      <div className="relative">
                        <input
                          className="w-full px-3 pr-12 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-slate-50/50 text-sm"
                          type={showRegPass ? 'text' : 'password'}
                          placeholder="Create a secure password"
                          value={regPass}
                          onChange={e => setRegPass(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPass(!showRegPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <i className={`bi bi-${showRegPass ? 'eye-slash' : 'eye'} text-sm`} />
                        </button>
                      </div>
                    </div>

                    <button
                      className="w-full py-4 lg:py-6 px-6 lg:px-8 text-white font-bold text-sm lg:text-lg rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #155414, #1e6e1e)' }}
                      disabled={loading}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Submitting...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-3">
                          <i className="bi bi-person-plus-fill" />
                          Create Account
                        </span>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6">
            <p className="text-green-200 text-xs">
              {new Date().getFullYear()} Philippine Fiber Industry Development Authority
            </p>
            <p className="text-green-300 text-xs mt-1">Secure Government Task Management System</p>
          </div>
        </div>
      </div>
    </div>
  )
}