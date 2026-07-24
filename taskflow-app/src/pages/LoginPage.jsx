import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { loginUser, registerUser, signInWithGoogle, handleGoogleCallback, checkAccountStatus, getDirectorAvailability, UNITS, OFFICES, REGIONS } from '../lib/api'
import { withErrorHandling, validateForm, ERROR_MESSAGES, handleError } from '../lib/errorHandler'

export default function LoginPage() {
  const [tab, setTab] = useState('login')
  const [loginId, setLoginId] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginRegion, setLoginRegion] = useState('Region I')
  const [googleRegion, setGoogleRegion] = useState('Region I')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [regId, setRegId] = useState('')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regUnit, setRegUnit] = useState('')
  const [regRegion, setRegRegion] = useState('Region I')
  const [regRole, setRegRole] = useState('Employee')
  const [showApprovalInfo, setShowApprovalInfo] = useState(false)
  const [regPass, setRegPass] = useState('')
  const [regConfirmPass, setRegConfirmPass] = useState('')
  const [showRegPass, setShowRegPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [showStatusCheck, setShowStatusCheck] = useState(false)
  const [statusCheckId, setStatusCheckId] = useState('')
  const [statusChecking, setStatusChecking] = useState(false)
  const [statusResult, setStatusResult] = useState(null) // 'active' | 'inactive' | null
  const [approvedToast, setApprovedToast] = useState(false)
  const approvalWatchRef = useRef(null)

  const setSession = useStore(s => s.setSession)
  const navigate = useNavigate()
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

  // Load remembered credentials
  useEffect(() => {
    const savedId = localStorage.getItem('philfida_remember_id')
    const savedRegion = localStorage.getItem('philfida_remember_region')
    if (savedId) {
      setLoginId(savedId)
      setRememberMe(true)
    }
    if (savedRegion) {
      setLoginRegion(savedRegion)
    }
  }, [])

  // Auto-lookup and select region based on Employee ID
  useEffect(() => {
    const trimmedId = loginId.trim()
    if (!trimmedId) {
      const savedRegion = localStorage.getItem('philfida_remember_region')
      setLoginRegion(savedRegion || 'Region I')
      return
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('Users')
          .select('Region')
          .eq('ID', trimmedId)
          .single()
        if (data?.Region) {
          setLoginRegion(data.Region)
        }
      } catch (e) {
        // Silently ignore
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [loginId])

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

      const savedGoogleRegion = localStorage.getItem('philfida_google_region') || 'Region I'
      localStorage.removeItem('philfida_google_region')

      // Retry up to 5 times with 1s delay — allow session / app user row to settle
      let result = null
      for (let i = 0; i < 5; i++) {
        result = await handleGoogleCallback(savedGoogleRegion)
        if (result) break
        await new Promise(r => setTimeout(r, 1000))
      }

      if (!result) {
        // Lands here for failed Google callbacks AND for approval-email links
        // opened in a different browser than the one that triggered them
        // (PKCE verifier lives in the sender's browser, so no session can be
        // established). Either way the fix for the user is the same: sign in
        // normally below — so say that instead of a scary config error.
        setError('Automatic sign-in could not be completed. Please sign in below with your credentials.')
        setGoogleLoading(false)
        return
      }

      const { user, isNew } = result
      if (isNew) {
        const dir = await getDirectorAvailability(user.Region || savedGoogleRegion)
        setSuccess('Your Google account has been submitted for approval. The Director will review your account before you can log in.' + directorAvailabilityNote(dir, user.Region || savedGoogleRegion))
        watchForApproval(user.ID)
        setGoogleLoading(false)
        return
      }
      if (user.AccountStatus === 'Pending') {
        const dir = await getDirectorAvailability(user.Region)
        setError('Your account is pending approval by the Director.' + directorAvailabilityNote(dir, user.Region))
        watchForApproval(user.ID)
        setGoogleLoading(false)
        return
      }
      if (user.AccountStatus === 'Deactivated') { setError('Your account has been deactivated. Contact the Director.'); setGoogleLoading(false); return }

      const needsSetup = !user.Designation && !user.Unit && !user.Office
      setSession({ ...user, _needsProfileSetup: needsSetup })
      if (user.Role === 'Director') navigate('/director')
      else if (user.Role === 'Records') navigate('/records')
      else if (user.Role === 'Unit Head') navigate('/unithead')
      else navigate('/dashboard')
    }

    void processCallback()
  }, [])

  // ── Manual login ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')

    // Validate form
    const validation = validateForm(
      { loginId, loginPass },
      {
        loginId: { required: true, label: 'Employee ID No.' },
        loginPass: { required: true, label: 'Password', minLength: 1 }
      }
    )

    if (!validation.isValid) {
      setError(Object.values(validation.errors)[0])
      setLoading(false)
      return
    }

    try {
      let targetRegion = loginRegion
      const { data: userRegionData } = await supabase
        .from('Users')
        .select('Region')
        .eq('ID', loginId.trim())
        .single()
      if (userRegionData?.Region) {
        targetRegion = userRegionData.Region
        setLoginRegion(targetRegion)
      }

      // C2/C3 FIX: loginUser queries only the matching user by ID — never fetches all users
      const result = await loginUser(loginId, loginPass, targetRegion)

      if (result.error === 'invalid_credentials') {
        setError('Invalid Employee ID No. or Password.')
        return
      }
      if (result.error === 'invalid_region') {
        setError(`Access denied. Your account is not registered in ${targetRegion}.`)
        return
      }
      if (result.error === 'pending') {
        const dir = await getDirectorAvailability(targetRegion)
        setError('Your account is pending approval by the Director.' + directorAvailabilityNote(dir, targetRegion))
        watchForApproval(loginId.trim())
        return
      }
      if (result.error === 'deactivated') {
        setError('Your account has been deactivated. Contact the Director.')
        return
      }
      if (result.error) {
        setError('Login failed. Please try again.')
        return
      }

      // Handle Remember Me
      if (rememberMe) {
        localStorage.setItem('philfida_remember_id', loginId)
        localStorage.setItem('philfida_remember_region', loginRegion)
      } else {
        localStorage.removeItem('philfida_remember_id')
        localStorage.removeItem('philfida_remember_region')
      }

      const user = result.user
      // Set session and navigate based on role
      setSession(user)
      if (user.Role === 'Director') {
        navigate('/director')
      } else if (user.Role === 'Records') {
        navigate('/records')
      } else if (user.Role === 'Unit Head') {
        navigate('/unithead')
      } else {
        navigate('/dashboard')
      }
    } catch (error) {
      setError(error.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Google sign in ──────────────────────────────────────────
  async function handleGoogleSignIn() {
    setGoogleLoading(true); setError('')
    try {
      // Deliberately independent from loginRegion/remembered region — Google
      // sign-in only needs a region when creating a brand-new account, and it
      // must be the region the user picks right now, not whatever the manual
      // login form last remembered.
      localStorage.setItem('philfida_google_region', googleRegion)
      await signInWithGoogle()
    } catch (e) {
      setError(`Could not connect to Google. ${e?.message || ''} Please try again.`)
      setGoogleLoading(false)
    }
  }

  // ── Register ────────────────────────────────────────────────
  async function handleRegister(e) {
    e.preventDefault()
    if (!regId || !regName || !regPass || !regRegion) { setError('All fields are required.'); return }
    if (regEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) { setError('Please enter a valid email address.'); return }
    if (regPass !== regConfirmPass) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    try {
      const result = await registerUser({ id: regId.trim(), name: regName, email: regEmail, unit: '', role: 'Employee', pass: regPass, region: regRegion })
      if (result === 'SUCCESS') {
        const dir = await getDirectorAvailability(regRegion)
        setSuccess('Registration submitted! Your account is pending Director approval.' + directorAvailabilityNote(dir, regRegion))
        watchForApproval(regId.trim())
        setTab('login')
        setRegId(''); setRegName(''); setRegEmail(''); setRegUnit(''); setRegRole('Employee'); setRegPass(''); setRegConfirmPass('')
      } else if (result === 'EXISTS') {
        setError('This Employee ID No. or Email is already registered.')
      }
    } catch (error) { setError('Registration failed. Please try again.') }
    finally { setLoading(false) }
  }

  function switchTab(t) { setTab(t); setError(''); setSuccess('') }

  // Live approval watch: after registering (or hitting a "pending" login),
  // subscribe to this user's row — when the Director flips AccountStatus to
  // Active while this page is open, pop the approval toast immediately.
  function watchForApproval(userId) {
    if (!userId) return
    try {
      if (approvalWatchRef.current) supabase.removeChannel(approvalWatchRef.current)
      const ch = supabase
        .channel(`approval-watch-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'Users', filter: `ID=eq.${userId}` },
          (payload) => {
            if (payload.new?.AccountStatus === 'Active') {
              setApprovedToast(true)
              setSuccess('Your account has been approved! You can now sign in.')
              try { supabase.removeChannel(ch) } catch {}
              approvalWatchRef.current = null
            }
          }
        )
        .subscribe()
      approvalWatchRef.current = ch
    } catch (e) { console.warn('Approval watch failed:', e) }
  }

  useEffect(() => () => {
    if (approvalWatchRef.current) {
      try { supabase.removeChannel(approvalWatchRef.current) } catch {}
    }
  }, [])

  function directorAvailabilityNote(dir, region) {
    if (!dir) return ''
    return dir.status === 'Available'
      ? ` The ${region} Director is currently Available — your account may be approved shortly. Keep this page open and you'll be notified here the moment it's approved.`
      : ` Please note: the ${region} Director is currently ${dir.status}, so approval may take longer than usual. You can check back anytime using "Check your account status".`
  }

  // Self-serve status check — no password required. Response is deliberately
  // coarse (active vs not) so this can't be used to enumerate account state.
  async function handleCheckStatus(e) {
    e.preventDefault()
    if (!statusCheckId.trim() || statusChecking) return
    setStatusChecking(true)
    setStatusResult(null)
    try {
      setStatusResult(await checkAccountStatus(statusCheckId))
    } catch {
      setStatusResult('inactive')
    } finally {
      setStatusChecking(false)
    }
  }

  if (googleLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center login-gradient"
        role="status"
        aria-live="polite"
      >
        <div className="text-center px-4">
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-5" style={{ borderWidth: 3 }} />
          <h2 className="text-white font-semibold text-lg">Signing in with Google</h2>
          <p className="text-green-200 text-sm mt-1.5">Verifying your account...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 w-full h-full login-gradient">

      {/* ── ACCOUNT APPROVED TOAST (live, via realtime watch) ── */}
      {approvedToast && (
        <div role="status" className="fixed top-4 right-4 z-toast max-w-sm w-full bg-green-900 text-white rounded-xl shadow-lg border border-green-800/60 p-4 animate-in-right flex items-start gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20 text-green-400">
            <i className="bi bi-patch-check-fill text-lg leading-none" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs leading-tight uppercase tracking-wider text-green-400">Account Approved</p>
            <p className="text-[11px] text-green-100 font-medium mt-1 leading-relaxed">
              Your account has been approved by the Director. You can now sign in with your credentials.
            </p>
          </div>
          <button onClick={() => setApprovedToast(false)} className="text-green-300 hover:text-white flex-shrink-0" aria-label="Dismiss">
            <i className="bi bi-x-lg text-sm" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Scrollable container */}
      <div className="w-full h-full overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4 py-10">

          {/* Login Card */}
          <div className="w-[clamp(300px,90vw,420px)]">

            {/* Header with logos */}
            <div className="text-center mb-7">
              <div className="flex justify-center items-center mb-5">
                {/* PhilFIDA Logo */}
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center overflow-hidden p-1.5 shadow-md shadow-black/20">
                  <img src="/philfida-logo.png" alt="PhilFIDA Logo" className="w-full h-full object-contain"
                    onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span class="text-sm font-bold text-green-800">PhilFIDA</span>' }} />
                </div>
              </div>

              <p className="text-green-300 text-[10px] font-semibold uppercase tracking-widest mb-2">Republic of the Philippines</p>
              <h1 className="text-white font-bold text-lg leading-snug">
                Philippine Fiber Industry<br />
                <span className="text-yellow-300">Development Authority</span>
              </h1>
              <p className="text-green-300/80 text-xs mt-2 font-medium">Task Management System</p>
            </div>

            {/* Main Card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-black/25 overflow-hidden">

              {/* Tab switcher */}
              <div className="flex p-1.5 bg-slate-50 border-b border-slate-100" role="tablist">
                <button 
                  role="tab"
                  aria-selected={tab === 'login'}
                  aria-controls="panel-login"
                  id="tab-login"
                  onClick={() => switchTab('login')}
                  className={`flex-1 py-3 px-6 text-sm font-bold rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset ${tab === 'login'
                    ? 'bg-white text-green-800 shadow-sm'
                    : 'text-slate-500 hover:text-green-700 hover:bg-white/50'
                    }`}
                >
                  Sign In
                </button>
                <button 
                  role="tab"
                  aria-selected={tab === 'register'}
                  aria-controls="panel-register"
                  id="tab-register"
                  onClick={() => switchTab('register')}
                  className={`flex-1 py-3 px-6 text-sm font-bold rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset ${tab === 'register'
                    ? 'bg-white text-green-800 shadow-sm'
                    : 'text-slate-500 hover:text-green-700 hover:bg-white/50'
                    }`}
                >
                  Register
                </button>
              </div>

              {/* Form content wrapper - padding only to avoid nested card boundaries */}
              <div className="p-6 sm:p-8 space-y-6">

                {/* Alerts */}
                {connectionError && (
                  <div role="alert" className="bg-red-50 border border-red-200/60 text-red-800 rounded-2xl p-4 mb-2 shadow-sm">
                    <div className="flex items-start gap-3">
                      <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
                      <div className="text-sm leading-relaxed">
                        <pre className="whitespace-pre-wrap font-sans font-medium">{connectionError}</pre>
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <div role="alert" className="flex items-start gap-3 bg-red-50 border border-red-200/60 text-red-800 text-sm rounded-2xl px-4 py-3.5 mb-2 shadow-sm">
                    <i className="bi bi-exclamation-triangle-fill text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="font-semibold">{error}</span>
                  </div>
                )}
                {success && (
                  <div role="status" className="flex items-start gap-3 bg-green-50 border border-green-200/60 text-green-950 text-sm rounded-2xl px-4 py-3.5 mb-2 shadow-sm">
                    <i className="bi bi-check-circle-fill text-green-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="font-semibold">{success}</span>
                  </div>
                )}

                {/* SIGN IN TAB */}
                {tab === 'login' && (
                  <div id="panel-login" role="tabpanel" aria-labelledby="tab-login" className="space-y-6">
                    <div className="text-center">
                      <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-1">Welcome Back</h2>
                      <p className="text-slate-500 text-xs sm:text-sm font-semibold">Sign in to access your dashboard</p>
                    </div>

                    {/* Google Sign In */}
                    <div>
                      <label htmlFor="google-region" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Region for Google sign-in</label>
                      <div className="relative mb-2.5">
                        <select
                          id="google-region"
                          className="w-full pl-3.5 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-xs font-semibold text-slate-700 appearance-none"
                          value={googleRegion}
                          onChange={e => setGoogleRegion(e.target.value)}
                        >
                          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <i className="bi bi-chevron-down text-xs" aria-hidden="true" />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mb-2.5 -mt-1">Only used if this Google account creates a new registration.</p>
                    </div>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading}
                      className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-sm rounded-xl py-3 px-4 transition-all duration-200 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      <svg width="20" height="20" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                        <path d="M47.532 24.552c0-1.636-.147-3.2-.42-4.704H24v8.898h13.204c-.568 3.072-2.292 5.676-4.884 7.42v6.168h7.908c4.624-4.26 7.304-10.54 7.304-17.782z" fill="#4285F4" />
                        <path d="M24 48c6.636 0 12.204-2.196 16.272-5.952l-7.908-6.168c-2.196 1.476-5.004 2.34-8.364 2.34-6.432 0-11.88-4.344-13.824-10.176H2.016v6.372C6.072 42.9 14.448 48 24 48z" fill="#34A853" />
                        <path d="M10.176 28.044A14.88 14.88 0 019.396 24c0-1.392.24-2.748.672-4.02v-6.372H2.016A23.988 23.988 0 000 24c0 3.876.936 7.548 2.016 10.392l8.16-6.348z" fill="#FBBC05" />
                        <path d="M24 9.54c3.624 0 6.876 1.248 9.432 3.696l7.08-7.08C36.192 2.196 30.636 0 24 0 14.448 0 6.072 5.1 2.016 13.608l8.16 6.372C12.12 13.884 17.568 9.54 24 9.54z" fill="#EA4335" />
                      </svg>
                      Continue with Google
                    </button>

                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-100" />
                      </div>
                      <div className="relative flex justify-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <span className="px-4 bg-white text-slate-500">or sign in with ID</span>
                      </div>
                    </div>

                    {/* Manual login form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label htmlFor="login-id" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Employee ID No.</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <i className="bi bi-person-fill text-base" aria-hidden="true" />
                          </div>
                          <input
                            id="login-id"
                            type="text"
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all"
                            placeholder="Enter your Employee ID No."
                            value={loginId}
                            onChange={e => setLoginId(e.target.value)}
                            autoComplete="username"
                            aria-describedby={loginRegion && loginId.trim() ? "login-region-desc" : undefined}
                            required
                          />
                        </div>
                        {loginRegion && loginId.trim() && (
                          <div id="login-region-desc" className="flex items-center gap-1.5 px-2 py-1 text-slate-400 text-[10px] font-medium mt-1.5 animate-fade-in">
                            <i className="bi bi-geo-alt text-[10px]" aria-hidden="true" />
                            <span>Registered region: {loginRegion}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="login-pass" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <i className="bi bi-lock-fill text-base" aria-hidden="true" />
                          </div>
                          <input
                            id="login-pass"
                            className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                            type={showPass ? 'text' : 'password'}
                            placeholder="Enter your password"
                            value={loginPass}
                            onChange={e => setLoginPass(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass(!showPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 rounded-md p-1.5 transition-colors"
                            aria-label={showPass ? "Hide password" : "Show password"}
                          >
                            <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'} text-sm`} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label htmlFor="remember-me" className="flex items-center gap-2.5 cursor-pointer group">
                          <div className="relative flex items-center justify-center">
                            <input
                              id="remember-me"
                              type="checkbox"
                              className="peer appearance-none w-5 h-5 rounded-md border border-slate-300 checked:border-green-600 checked:bg-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transition-all duration-200 cursor-pointer"
                              checked={rememberMe}
                              onChange={e => setRememberMe(e.target.checked)}
                            />
                            <i className="bi bi-check text-white text-sm absolute opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" aria-hidden="true" />
                          </div>
                          <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors font-semibold">Remember me</span>
                        </label>
                      </div>

                      <button
                        type="submit"
                        className="btn-primary-gradient w-full py-3 px-6 text-white font-bold text-sm rounded-xl transition-all duration-200 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:opacity-60 mt-2"
                        disabled={loading}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Signing in...
                          </span>
                        ) : (
                          'Sign In'
                        )}
                      </button>
                    </form>

                    {/* Self-serve approval status check */}
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setShowStatusCheck(v => !v); setStatusResult(null) }}
                        className="text-xs font-semibold text-slate-500 hover:text-green-700 transition-colors"
                      >
                        Waiting for approval? Check your account status
                      </button>
                    </div>

                    {showStatusCheck && (
                      <form onSubmit={handleCheckStatus} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex gap-2">
                          <input
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                            placeholder="Employee ID No. or Google email"
                            value={statusCheckId}
                            onChange={e => { setStatusCheckId(e.target.value); setStatusResult(null) }}
                          />
                          <button
                            type="submit"
                            disabled={statusChecking || !statusCheckId.trim()}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {statusChecking ? '...' : 'Check'}
                          </button>
                        </div>
                        {statusResult === 'active' && (
                          <p className="flex items-center gap-2 text-xs font-semibold text-green-800">
                            <i className="bi bi-check-circle-fill text-green-600" aria-hidden="true" />
                            Your account is active — you can sign in above.
                          </p>
                        )}
                        {statusResult === 'inactive' && (
                          <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <i className="bi bi-hourglass-split text-amber-600" aria-hidden="true" />
                            Not active yet. Check back later or contact your Director.
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                )}

                {/* REGISTER TAB */}
                {tab === 'register' && (
                  <div id="panel-register" role="tabpanel" aria-labelledby="tab-register" className="space-y-6">
                    <div className="text-center">
                      <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-1">Create Account</h2>
                      <p className="text-slate-500 text-xs sm:text-sm font-semibold">Submit your registration for approval</p>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-200/50 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowApprovalInfo(v => !v)}
                        aria-expanded={showApprovalInfo}
                        className="w-full flex items-center gap-3 p-4 text-left"
                      >
                        <i className="bi bi-info-circle-fill text-amber-600 flex-shrink-0 text-lg" aria-hidden="true" />
                        <p className="flex-1 font-bold text-xs sm:text-sm text-amber-950">Account Approval Required</p>
                        <i className={`bi bi-chevron-down text-amber-600 text-xs flex-shrink-0 transition-transform duration-200 ${showApprovalInfo ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {showApprovalInfo && (
                        <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium px-4 pb-4 -mt-1 pl-11">
                          Your account will be reviewed and approved by your Region's Director before you can sign in. After submitting, you'll see the Director's current availability — and if you keep this page open, you'll be notified here the moment your account is approved. You can also check anytime via "Check your account status" on the Sign In tab.
                        </p>
                      )}
                    </div>

                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="reg-name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Full Name</label>
                          <input
                            id="reg-name"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                            placeholder="Juan dela Cruz"
                            value={regName}
                            onChange={e => setRegName(e.target.value)}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-id" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Employee ID No.</label>
                          <input
                            id="reg-id"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                            placeholder="e.g. 001"
                            value={regId}
                            onChange={e => setRegId(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                        <input
                          id="reg-email"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                          type="email"
                          placeholder="juan@gmail.com"
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                        />
                        <p className="text-[11px] text-slate-400 mt-1.5">Optional — for account records and the Director's reference.</p>
                      </div>

                      <div>
                        <label htmlFor="reg-region" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Assigned Region</label>
                        <div className="relative">
                          <select
                            id="reg-region"
                            className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 appearance-none"
                            value={regRegion}
                            onChange={e => setRegRegion(e.target.value)}
                            required
                          >
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <i className="bi bi-chevron-down text-sm" aria-hidden="true" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-pass" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
                        <div className="relative">
                          <input
                            id="reg-pass"
                            className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                            type={showRegPass ? 'text' : 'password'}
                            placeholder="Create a secure password"
                            value={regPass}
                            onChange={e => setRegPass(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPass(!showRegPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 rounded-md p-1.5 transition-colors"
                            aria-label={showRegPass ? "Hide password" : "Show password"}
                          >
                            <i className={`bi bi-${showRegPass ? 'eye-slash' : 'eye'} text-sm`} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-confirm-pass" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Confirm Password</label>
                        <input
                          id="reg-confirm-pass"
                          className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:outline-none focus:bg-white focus:ring-2 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400 ${
                            regConfirmPass && regConfirmPass !== regPass
                              ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                              : 'border-slate-200 focus:ring-green-600/20 focus:border-green-600'
                          }`}
                          type={showRegPass ? 'text' : 'password'}
                          placeholder="Re-enter your password"
                          value={regConfirmPass}
                          onChange={e => setRegConfirmPass(e.target.value)}
                          required
                        />
                        {regConfirmPass && regConfirmPass !== regPass && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1.5">Passwords do not match.</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        className="btn-primary-gradient w-full py-3 px-6 text-white font-bold text-sm rounded-xl transition-all duration-200 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:opacity-60 mt-2"
                        disabled={loading}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Submitting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <i className="bi bi-person-plus-fill" aria-hidden="true" />
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
            <div className="text-center mt-5">
              <p className="text-green-300/70 text-[11px]">
                © {new Date().getFullYear()} Philippine Fiber Industry Development Authority
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}