import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { updateProfile, getSignedFileUrl, UNITS, OFFICES } from '../lib/api'
import PresenceToggle, { normalizeStatus } from './PresenceToggle'
import { supabase } from '../lib/supabase'
import SettingsModal from './SettingsModal'

export default function UserProfileTab({ presence, setPresence }) {
  const session = useStore(s => s.session)
  const setSession = useStore(s => s.setSession)
  const globalData = useStore(s => s.globalData)
  const [name, setName] = useState(session?.Name || '')
  const [email, setEmail] = useState(session?.Email || '')
  const [unit, setUnit] = useState(session?.Unit || session?.Office || '')
  const [designation, setDesignation] = useState(session?.Designation || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const isGoogleUser = !session?.Password
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [signedUrl, setSignedUrl] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)

  useEffect(() => {
    if (!presence) return
    const fileMatch = presence.match(/\[TO:(.*?)\]/)
    const rawUrl = fileMatch ? fileMatch[1] : null
    if (rawUrl) {
      setLoadingUrl(true)
      getSignedFileUrl(rawUrl)
        .then(url => { setSignedUrl(url); setLoadingUrl(false) })
        .catch(() => setLoadingUrl(false))
    } else {
      setSignedUrl('')
    }
  }, [presence])

  const director = globalData.users.find(u => u.Role === 'Director')
  const [dirSignedUrl, setDirSignedUrl] = useState('')
  const [loadingDirUrl, setLoadingDirUrl] = useState(false)

  useEffect(() => {
    if (!director?.Status) return
    const fileMatch = director.Status.match(/\[TO:(.*?)\]/)
    const rawUrl = fileMatch ? fileMatch[1] : null
    if (rawUrl) {
      setLoadingDirUrl(true)
      getSignedFileUrl(rawUrl)
        .then(url => { setDirSignedUrl(url); setLoadingDirUrl(false) })
        .catch(() => setLoadingDirUrl(false))
    } else {
      setDirSignedUrl('')
    }
  }, [director?.Status])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Full name is required.')
      return
    }
    if (!isGoogleUser && password && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await updateProfile(session.ID, {
        name: name.trim(),
        email: email.trim() || null,
        unit: unit.trim() || null,
        designation: designation.trim() || null,
        password: password ? password.trim() : undefined,
        sessionPassword: session?.Password ?? '',
      })

      setSession({
        ...session,
        Name: name.trim(),
        Email: email.trim() || null,
        Unit: unit.trim() || null,
        Office: unit.trim() || null,
        Designation: designation.trim() || null,
        ...(password?.trim() ? { Password: password.trim() } : {}),
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    useStore.getState().clearSession()
    localStorage.removeItem('philfida_session')
    window.location.href = '/'
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h2 className="font-bold text-green-900 text-xl leading-none">My Profile</h2>
        <p className="text-slate-500 text-sm mt-1.5">Manage your personal details and availability status</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-8 custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">

          {/* Left Column: Status & Actions */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 order-2 lg:order-1">

            {/* User Info Overview */}
            <div className="relative overflow-hidden rounded-2xl shadow-md" style={{ background: 'linear-gradient(135deg, #014d2a 0%, #016837 100%)' }}>
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <i className="bi bi-person-circle text-[120px] -mr-8 -mt-8" />
              </div>
              <div className="relative p-6 text-white">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl font-black border border-white/20 shadow-inner">
                    {session?.Name?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-black text-base truncate leading-tight uppercase tracking-tight text-white">{session?.Name}</h4>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-white/10 text-green-300 text-[10px] font-black uppercase rounded-lg border border-white/10">
                      {session?.Role || 'User'}
                    </span>
                  </div>
                </div>
                <div className="space-y-3 pt-5 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-green-300/60 text-[10px] font-black uppercase tracking-widest">Region</span>
                    <span className="font-bold text-xs">{session?.Region || 'Central Office'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-300/60 text-[10px] font-black uppercase tracking-widest">Unit / Office</span>
                    <span className="font-bold text-xs truncate max-w-[160px]">{session?.Designation || session?.Unit || session?.Office || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Availability Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <i className="bi bi-clock-history text-green-700" />
                  My Availability
                </h3>
              </div>
              <div className="p-5 space-y-5">
                <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} size="large" />

                {(() => {
                  const statusData = (() => {
                    if (!presence || presence === 'Available') return null
                    const fileMatch = presence.match(/\[TO:(.*?)\]/)
                    const fileUrl = fileMatch ? fileMatch[1] : null
                    const cleanStr = presence.replace(/\[TO:.*?\]/, '').trim()

                    if (cleanStr.startsWith('Official Travel — ')) {
                      const content = cleanStr.replace('Official Travel — ', '')
                      const dateMatch = content.match(/\((.*?)\)$/)
                      const dates = dateMatch ? dateMatch[1] : ''
                      const rest = content.replace(/\s*\(.*?\)$/, '')
                      const parts = rest.split(' at ')
                      return { type: 'Official Travel', title: parts[0], location: parts[1] || '', dates, fileUrl }
                    }

                    if (cleanStr.startsWith('On Leave — ')) {
                      const content = cleanStr.replace('On Leave — ', '')
                      const dateMatch = content.match(/\((.*?)\)$/)
                      const dates = dateMatch ? dateMatch[1] : ''
                      const rest = content.replace(/\s*\(.*?\)$/, '')
                      const parts = rest.split(': ')
                      return { type: 'On Leave', title: parts[0], reason: parts[1] || '', dates, fileUrl }
                    }

                    return { type: 'Away', title: cleanStr, fileUrl }
                  })()

                  if (!statusData) return null

                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-green-700 shadow-sm">
                          <i className={`bi text-xl ${statusData.type === 'Official Travel' ? 'bi-airplane-fill' : 'bi-calendar-event-fill'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Status Detail</p>

                          <div className="space-y-4">
                            <div>
                              <p className="text-[10px] font-black text-slate-500 uppercase">Subject</p>
                              <p className="text-sm text-slate-900 font-bold leading-tight mt-0.5">{statusData.title}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              {statusData.type === 'Official Travel' ? (
                                <div>
                                  <p className="text-[10px] font-black text-slate-500 uppercase">Location</p>
                                  <p className="text-[11px] text-slate-700 font-bold mt-0.5">{statusData.location || '—'}</p>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-[10px] font-black text-slate-500 uppercase">Reason</p>
                                  <p className="text-[11px] text-slate-700 font-bold mt-0.5">{statusData.reason || '—'}</p>
                                </div>
                              )}

                              <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase">Effective</p>
                                <p className="text-[11px] text-slate-700 font-bold mt-0.5">{statusData.dates || '—'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {statusData.fileUrl && (
                        <div className="pt-4 border-t border-slate-200 flex gap-2">
                          <a href={signedUrl || '#'} target={signedUrl ? "_blank" : "_self"} rel="noopener noreferrer"
                            className={`flex-1 flex items-center justify-center gap-2 py-2 border text-[10px] font-black uppercase rounded-lg transition-all
                              ${signedUrl ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300' : 'bg-slate-50 border-slate-100 text-slate-300 cursor-wait'}`}
                          >
                            {loadingUrl ? <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <i className="bi bi-eye-fill" />}
                            View File
                          </a>
                          <a href={signedUrl || '#'} download
                            className={`flex-1 flex items-center justify-center gap-2 py-2 border text-[10px] font-black uppercase rounded-lg transition-all
                              ${signedUrl ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300' : 'bg-slate-50 border-slate-100 text-slate-300 cursor-wait'}`}
                          >
                            <i className="bi bi-download" />
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Account Actions Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <i className="bi bi-gear-fill text-green-700" />
                  System Controls
                </h3>
              </div>

              <div className="p-4 space-y-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 hover:border-slate-200 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 group-hover:text-green-700 transition-colors">
                    <i className="bi bi-sliders text-lg" />
                  </div>
                  <span className="text-sm font-bold text-slate-700 flex-1 text-left">Notifications</span>
                  <i className="bi bi-chevron-right text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>

                <button
                  onClick={logout}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-red-600 border border-red-700 rounded-xl hover:bg-red-700 shadow-sm shadow-red-200 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white group-hover:bg-white/30 transition-colors">
                    <i className="bi bi-box-arrow-right text-lg" />
                  </div>
                  <span className="text-sm font-bold text-white flex-1 text-left">Sign Out</span>
                  <i className="bi bi-arrow-right-short text-white/50 group-hover:text-white transition-colors text-xl" />
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Personal Details */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6 order-1 lg:order-2">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <i className="bi bi-person-lines-fill text-green-700" />
                    Personal Details
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Manage your identity and account security</p>
                </div>
                <div className="hidden sm:block">
                  <span className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase rounded-lg border border-green-100">
                    Profile Settings
                  </span>
                </div>
              </div>

              <div className="p-6 md:p-8">
                {error && (
                  <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-xl px-4 py-3.5">
                    <i className="bi bi-exclamation-circle-fill flex-shrink-0" />
                    <span className="font-semibold">{error}</span>
                  </div>
                )}
                {success && (
                  <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-100 text-green-700 text-[13px] rounded-xl px-4 py-3.5">
                    <i className="bi bi-check-circle-fill flex-shrink-0" />
                    <span className="font-semibold">Profile updated successfully.</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                      <input
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm placeholder:text-slate-300 font-medium"
                        placeholder="e.g. Juan Dela Cruz"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                      <input
                        type="email"
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm placeholder:text-slate-300 font-medium"
                        placeholder="user@philfida.gov.ph"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit / Office</label>
                      <div className="relative">
                        <select
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm font-medium appearance-none"
                          value={unit}
                          onChange={e => setUnit(e.target.value)}
                        >
                          <option value="">-- Select Unit/Office --</option>
                          {(session?.Role === 'Director' || session?.Role === 'Records' ? OFFICES : UNITS).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <i className="bi bi-chevron-down text-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Designation / Position</label>
                      <input
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm placeholder:text-slate-300 font-medium"
                        placeholder="e.g. Project Assistant II"
                        value={designation}
                        onChange={e => setDesignation(e.target.value)}
                      />
                    </div>
                  </div>

                  {!isGoogleUser ? (
                    <div className="pt-8 border-t border-slate-100">
                      <div className="mb-6">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Security Credentials</h4>
                        <p className="text-[11px] text-slate-400 mt-1">Leave blank to keep your current password</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">New Password</label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Min. 8 characters"
                              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm pr-12 font-medium"
                              value={password}
                              onChange={e => setPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(prev => !prev)}
                              className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-green-600 transition-colors"
                            >
                              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Re-type new password"
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all shadow-sm font-medium"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-4">
                      <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
                        <i className="bi bi-google text-blue-500" />
                        <p className="font-medium italic">Google-managed account. Password changes are disabled.</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 rounded-xl font-black text-xs text-white uppercase tracking-widest shadow-md hover:shadow-lg active:scale-95 transition-all w-full sm:w-auto min-w-[160px]"
                      style={{ background: 'linear-gradient(135deg, #016837, #027a42)' }}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Saving...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <i className="bi bi-save2-fill" />
                          <span>Update Profile</span>
                        </div>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Director's Availability Section */}
            {session?.Role !== 'Director' && director && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <i className="bi bi-shield-shaded text-green-700" />
                      Director's Availability
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Stay informed about the Director's current events</p>
                  </div>
                  <span className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase rounded-lg border border-green-100">
                    Live Status
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-12 h-12 rounded-xl bg-green-800 flex items-center justify-center text-lg font-black text-white shadow-lg shadow-green-900/20">
                      {director.Name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm leading-tight uppercase">{director.Name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${
                          normalizeStatus(director.Status) === 'Available' ? 'bg-emerald-500' :
                          normalizeStatus(director.Status) === 'Official Travel' ? 'bg-blue-500' : 'bg-red-500'
                        }`} />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {normalizeStatus(director.Status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {director.Status && director.Status !== 'Available' ? (() => {
                    const statusData = (() => {
                      const fileMatch = director.Status.match(/\[TO:(.*?)\]/)
                      const fileUrl = fileMatch ? fileMatch[1] : null
                      const cleanStr = director.Status.replace(/\[TO:.*?\]/, '').trim()

                      if (cleanStr.startsWith('Official Travel — ')) {
                        const content = cleanStr.replace('Official Travel — ', '')
                        const dateMatch = content.match(/\((.*?)\)$/)
                        const dates = dateMatch ? dateMatch[1] : ''
                        const rest = content.replace(/\s*\(.*?\)$/, '')
                        const parts = rest.split(' at ')
                        return { type: 'Official Travel', title: parts[0], location: parts[1] || '', dates, fileUrl }
                      }

                      if (cleanStr.startsWith('On Leave — ')) {
                        const content = cleanStr.replace('On Leave — ', '')
                        const dateMatch = content.match(/\((.*?)\)$/)
                        const dates = dateMatch ? dateMatch[1] : ''
                        const rest = content.replace(/\s*\(.*?\)$/, '')
                        const parts = rest.split(': ')
                        return { type: 'On Leave', title: parts[0], reason: parts[1] || '', dates, fileUrl }
                      }

                      return { type: 'Away', title: cleanStr, fileUrl }
                    })()

                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-white border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Event / Activity</p>
                            <p className="text-sm text-slate-900 font-bold leading-tight">{statusData.title}</p>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                              {statusData.type === 'Official Travel' ? 'Location' : 'Reason'}
                            </p>
                            <p className="text-sm text-slate-900 font-bold leading-tight">{statusData.location || statusData.reason || '—'}</p>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-xl md:col-span-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Inclusive Dates</p>
                            <p className="text-sm text-slate-900 font-bold leading-tight">{statusData.dates || '—'}</p>
                          </div>
                        </div>

                        {statusData.fileUrl && (
                          <div className="flex gap-2">
                            <button onClick={() => dirSignedUrl && window.open(dirSignedUrl, '_blank')}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 border text-[10px] font-black uppercase rounded-lg transition-all
                                ${dirSignedUrl ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-50 border-slate-100 text-slate-300 cursor-wait'}`}
                            >
                              {loadingDirUrl ? <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <i className="bi bi-file-earmark-text" />}
                              View Travel Order
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })() : (
                    <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <i className="bi bi-calendar-check text-slate-300 text-3xl mb-2" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No scheduled events</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} session={session} />}
    </div>

  )
}
