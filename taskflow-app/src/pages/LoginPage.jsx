import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getAllUsers, registerUser, signInWithGoogle, exchangePkceAuthCode, handleGoogleCallback, UNITS } from '../lib/api'

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

  const setSession    = useStore(s => s.setSession)
  const navigate   = useNavigate()
  const oauthHandledRef = useRef(false)

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
    const authCode = sp.get('code') || hashParams.get('code')

    if (oauthErr) {
      setGoogleLoading(true)
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'B', runId: 'post-fix', location: 'LoginPage.jsx:oauth-url-error', message: 'provider returned error query', data: { oauthErr, hasErrDesc: !!oauthErrDesc }, timestamp: Date.now() }) }).catch(() => {})
      // #endregion
      window.history.replaceState({}, document.title, window.location.pathname)
      setError(oauthErrDesc || oauthErr)
      setGoogleLoading(false)
      return
    }

    setGoogleLoading(true)

    async function processCallback() {
      // #region agent log
      try {
        await fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'A', runId: 'post-fix', location: 'LoginPage.jsx:oauth-callback', message: 'callback entry before exchange', data: { origin: window.location.origin, pathname: window.location.pathname, hasCodeParam: !!authCode, codeLen: authCode?.length ?? 0, codeFromHash: !sp.get('code') && !!hashParams.get('code'), hashHasAccessToken: window.location.hash.includes('access_token') }, timestamp: Date.now() }) })
      } catch (_) {}
      // #endregion

      const { error: pkceError } = await exchangePkceAuthCode(authCode)
      if (pkceError) {
        // #region agent log
        try {
          await fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'A', runId: 'post-fix', location: 'LoginPage.jsx:processCallback', message: 'pkce exchange failed', data: { errMessage: pkceError.message || null }, timestamp: Date.now() }) })
        } catch (_) {}
        // #endregion
        window.history.replaceState({}, document.title, window.location.pathname)
        setError(pkceError.message || 'Google sign-in failed. Please try again.')
        setGoogleLoading(false)
        return
      }

      if (!authCode && window.location.hash.includes('access_token')) {
        await supabase.auth.getSession()
      }

      window.history.replaceState({}, document.title, window.location.pathname)
      // #region agent log
      try {
        await fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'A', runId: 'post-fix', location: 'LoginPage.jsx:after-replaceState', message: 'url cleaned after exchange', data: { pathname: window.location.pathname }, timestamp: Date.now() }) })
      } catch (_) {}
      // #endregion

      // Retry up to 5 times with 1s delay — allow session / app user row to settle
      let result = null
      for (let i = 0; i < 5; i++) {
        result = await handleGoogleCallback()
        // #region agent log
        try {
          await fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'D', runId: 'post-fix', location: 'LoginPage.jsx:processCallback', message: 'handleGoogleCallback attempt', data: { attempt: i + 1, hasResult: !!result }, timestamp: Date.now() }) })
        } catch (_) {}
        // #endregion
        if (result) break
        await new Promise(r => setTimeout(r, 1000))
      }

      if (!result) {
        // #region agent log
        try {
          await fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'D', runId: 'post-fix', location: 'LoginPage.jsx:processCallback', message: 'all callback attempts failed', data: {}, timestamp: Date.now() }) })
        } catch (_) {}
        // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea890d68-cfc2-490c-96ef-3e6da19b403c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hypothesisId: 'F', runId: 'post-fix', location: 'LoginPage.jsx:handleGoogleSignIn', message: 'signInWithGoogle threw before redirect', data: { errMessage: e?.message || null, errStatus: e?.status ?? null }, timestamp: Date.now() }) }).catch(() => {})
      // #endregion
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f0' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-green-900 font-semibold text-sm">Signing in with Google...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* LEFT PANEL */}
      <div
        className="relative flex flex-col justify-between md:w-[42%] lg:w-[38%] xl:w-1/3 min-h-[220px] md:min-h-screen px-8 py-10 md:px-12 md:py-14 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0a2e0a 0%, #155414 45%, #1a6e1a 100%)' }}
      >
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #4ade80, transparent)' }} />
        <div className="absolute bottom-10 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #86efac, transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8 md:mb-12">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden backdrop-blur-sm flex-shrink-0">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Bagong_Pilipinas_logo_%28DA%29.svg/200px-Bagong_Pilipinas_logo_%28DA%29.svg.png"
                alt="DA" className="w-11 h-11 object-contain" onError={e => { e.target.style.display='none' }} />
            </div>
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-lg flex-shrink-0 p-1">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-full h-full object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:#155414;text-align:center;line-height:1.1;">Phil<br/>FIDA</span>' }} />
            </div>
          </div>
          <div>
            <p className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Republic of the Philippines</p>
            <h1 className="text-white font-bold leading-tight mb-1" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.02em' }}>
              Philippine Fiber Industry<br />Development Authority
            </h1>
            <p className="text-green-300 text-sm font-medium mt-3">Task Management System</p>
            <div className="w-10 h-0.5 bg-yellow-400 mt-5 mb-6 rounded-full" />
            <ul className="space-y-3 hidden md:block">
              {['Assign and track personnel tasks', 'Real-time status updates', 'Secure file attachments', 'In-task messaging'].map(f => (
                <li key={f} className="flex items-center gap-3 text-green-200 text-sm">
                  <span className="w-5 h-5 rounded-full bg-green-500/30 border border-green-400/40 flex items-center justify-center flex-shrink-0">
                    <i className="bi bi-check text-green-300 text-xs" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative z-10 mt-8 md:mt-0">
          <p className="text-green-500 text-xs">© {new Date().getFullYear()} Philippine Fiber Industry Development Authority</p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-5 py-10 md:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {tab === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {tab === 'login' ? 'Sign in to your dashboard' : 'Submit your registration for approval'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-slate-200/70 rounded-xl p-1 mb-6">
            <button onClick={() => switchTab('login')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sign In</button>
            <button onClick={() => switchTab('register')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab === 'register' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Register</button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
              <i className="bi bi-exclamation-circle-fill flex-shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3 mb-5">
              <i className="bi bi-check-circle-fill flex-shrink-0 mt-0.5" /><span>{success}</span>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {tab === 'login' && (
            <div className="space-y-4">

              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 font-semibold text-sm rounded-xl py-3 transition-all shadow-sm disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                  <path d="M47.532 24.552c0-1.636-.147-3.2-.42-4.704H24v8.898h13.204c-.568 3.072-2.292 5.676-4.884 7.42v6.168h7.908c4.624-4.26 7.304-10.54 7.304-17.782z" fill="#4285F4"/>
                  <path d="M24 48c6.636 0 12.204-2.196 16.272-5.952l-7.908-6.168c-2.196 1.476-5.004 2.34-8.364 2.34-6.432 0-11.88-4.344-13.824-10.176H2.016v6.372C6.072 42.9 14.448 48 24 48z" fill="#34A853"/>
                  <path d="M10.176 28.044A14.88 14.88 0 019.396 24c0-1.392.24-2.748.672-4.02v-6.372H2.016A23.988 23.988 0 000 24c0 3.876.936 7.548 2.016 10.392l8.16-6.348z" fill="#FBBC05"/>
                  <path d="M24 9.54c3.624 0 6.876 1.248 9.432 3.696l7.08-7.08C36.192 2.196 30.636 0 24 0 14.448 0 6.072 5.1 2.016 13.608l8.16 6.372C12.12 13.884 17.568 9.54 24 9.54z" fill="#EA4335"/>
                </svg>
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or sign in with ID</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Manual login */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label">Personnel ID</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><i className="bi bi-person-fill" /></span>
                    <input className="input pl-9" placeholder="e.g. 001" value={loginId} onChange={e => setLoginId(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><i className="bi bi-lock-fill" /></span>
                    <input className="input pl-9 pr-10" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'}`} />
                    </button>
                  </div>
                </div>
                <button className="w-full py-3 text-white font-bold text-sm rounded-xl transition-all" style={{ background: 'linear-gradient(135deg, #155414, #1e6e1e)' }} disabled={loading}>
                  {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</span> : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* ── REGISTER ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                <i className="bi bi-info-circle-fill flex-shrink-0 mt-0.5" />
                <span>Your account will be reviewed by the Director before you can log in. You can also <button type="button" onClick={handleGoogleSignIn} className="underline font-semibold">sign up with Google</button> to skip entering a password.</span>
              </div>
              <div>
                <label className="label">Full Name</label>
                <input className="input" placeholder="Juan dela Cruz" value={regName} onChange={e => setRegName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Personnel ID</label>
                <input className="input" placeholder="e.g. 002" value={regId} onChange={e => setRegId(e.target.value)} required />
              </div>
              <div>
                <label className="label">Email Address <span className="text-slate-400 normal-case font-normal">(Optional)</span></label>
                <input className="input" type="email" placeholder="juan@philfida.gov.ph" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Unit</label>
                <select className="input" value={regUnit} onChange={e => setRegUnit(e.target.value)} required>
                  <option value="">-- Select Unit --</option>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={regRole} onChange={e => setRegRole(e.target.value)} required>
                  <option value="Employee">Unit Personnel</option>
                  <option value="Unit Head">Unit Head</option>
                </select>
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input className="input pr-10" type={showRegPass ? 'text' : 'password'} placeholder="Create a password" value={regPass} onChange={e => setRegPass(e.target.value)} required />
                  <button type="button" onClick={() => setShowRegPass(!showRegPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <i className={`bi bi-${showRegPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
              <button className="w-full py-3 text-white font-bold text-sm rounded-xl transition-all" style={{ background: 'linear-gradient(135deg, #155414, #1e6e1e)' }} disabled={loading}>
                {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</span> : 'Submit Registration'}
              </button>
            </form>
          )}

          <p className="text-center text-slate-400 text-xs mt-8">All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}