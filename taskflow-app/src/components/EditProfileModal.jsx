import { useState } from 'react'
import { useStore } from '../store/useStore'
import { updateProfile } from '../lib/api'

export default function EditProfileModal({ onClose }) {
  const session    = useStore(s => s.session)
  const setSession = useStore(s => s.setSession)
  const isFirstSetup = !!session?._needsProfileSetup

  const [name,        setName]        = useState(session?.Name        || '')
  const [designation, setDesignation] = useState(session?.Designation || '')
  const [email,       setEmail]       = useState(session?.Email       || '')
  const [unit,        setUnit]        = useState(session?.Unit || session?.Office || '')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  const isGoogleUser = !session?.Password

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Full name is required.'); return }
    setLoading(true); setError('')
    try {
      await updateProfile(session.ID, {
        name:        name.trim(),
        designation: designation.trim(),
        email:       email.trim(),
        unit:        unit.trim(),
      })
      // Update session in Zustand store so UI reflects immediately
      setSession({
        ...session,
        Name:              name.trim(),
        Designation:       designation.trim(),
        Email:             email.trim(),
        Unit:              unit.trim(),
        Office:            unit.trim(),
        ProfilePic:        '',
        _needsProfileSetup: false,
      })
      setSuccess(true)
      setTimeout(() => { setSuccess(false); onClose() }, 1200)
    } catch {
      setError('Failed to update profile. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2.5">
            <i className={`bi ${isFirstSetup ? "bi-stars" : "bi-person-circle"} text-white text-base`} />
            <div>
              <p className="text-white font-bold text-sm leading-none">{isFirstSetup ? "Complete Your Profile" : "Edit Profile"}</p>
              {isFirstSetup && <p className="text-green-300 text-[10px] mt-0.5">Welcome! Please fill in your details.</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Avatar preview */}
        <div className="flex flex-col items-center pt-5 pb-2 px-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl ring-4 ring-green-100 bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center text-white font-bold text-2xl">
              {(name || session?.Name || '?').charAt(0).toUpperCase()}
            </div>
            {isGoogleUser && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                <svg width="12" height="12" viewBox="0 0 48 48">
                  <path d="M47.532 24.552c0-1.636-.147-3.2-.42-4.704H24v8.898h13.204c-.568 3.072-2.292 5.676-4.884 7.42v6.168h7.908c4.624-4.26 7.304-10.54 7.304-17.782z" fill="#4285F4"/>
                  <path d="M24 48c6.636 0 12.204-2.196 16.272-5.952l-7.908-6.168c-2.196 1.476-5.004 2.34-8.364 2.34-6.432 0-11.88-4.344-13.824-10.176H2.016v6.372C6.072 42.9 14.448 48 24 48z" fill="#34A853"/>
                  <path d="M10.176 28.044A14.88 14.88 0 019.396 24c0-1.392.24-2.748.672-4.02v-6.372H2.016A23.988 23.988 0 000 24c0 3.876.936 7.548 2.016 10.392l8.16-6.348z" fill="#FBBC05"/>
                  <path d="M24 9.54c3.624 0 6.876 1.248 9.432 3.696l7.08-7.08C36.192 2.196 30.636 0 24 0 14.448 0 6.072 5.1 2.016 13.608l8.16 6.372C12.12 13.884 17.568 9.54 24 9.54z" fill="#EA4335"/>
                </svg>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            {isGoogleUser ? 'Signed in with Google' : `ID: ${session?.ID}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
          {isFirstSetup && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
              <i className="bi bi-google flex-shrink-0 mt-0.5" />
              <span>Your Google account was linked. Please complete your profile so the Director can properly identify you.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
              <i className="bi bi-exclamation-circle-fill flex-shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2">
              <i className="bi bi-check-circle-fill flex-shrink-0" /> Profile updated successfully!
            </div>
          )}

          {/* Full name */}
          <div>
            <label className="label">Full Name <span className="text-red-400">*</span></label>
            <input className="input" placeholder="Juan dela Cruz"
              value={name} onChange={e => setName(e.target.value)} required autoFocus />
            {isGoogleUser && (
              <p className="text-[10px] text-blue-500 mt-1">
                <i className="bi bi-info-circle mr-1" />
                Update your name as it appears in the system.
              </p>
            )}
          </div>

          {/* Designation */}
          <div>
            <label className="label">Designation / Position</label>
            <input className="input" placeholder="e.g. Administrative Officer II"
              value={designation} onChange={e => setDesignation(e.target.value)} />
          </div>

          {/* Email */}
          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              placeholder="juan@philfida.gov.ph"
              value={email}
              onChange={e => setEmail(e.target.value)}
              readOnly={isGoogleUser}
              className={`input ${isGoogleUser ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
            />
            {isGoogleUser && (
              <p className="text-[10px] text-slate-400 mt-1">Email is managed by your Google account.</p>
            )}
          </div>

          {/* Unit */}
          <div>
            <label className="label">Unit / Office</label>
            <select
              className="input"
              value={unit}
              onChange={e => setUnit(e.target.value)}
            >
              <option value="">-- Select Unit --</option>
              <option>Administrative and Management Unit</option>
              <option>Planning Unit</option>
              <option>Regulatory Unit</option>
              <option>Technical Assistance Unit</option>
              <option>Research Unit</option>
            </select>
          </div>

          {/* Role — read only */}
          <div>
            <label className="label">Role</label>
            <div className="input bg-slate-50 text-slate-400 cursor-not-allowed flex items-center gap-2">
              <i className="bi bi-shield-check text-green-600" />
              <span>{session?.Role}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Role is managed by the Director.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                : <><i className="bi bi-check-lg" /> Save Profile</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}