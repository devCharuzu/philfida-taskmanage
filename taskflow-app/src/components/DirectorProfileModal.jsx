import { useState } from 'react'
import { useStore } from '../store/useStore'
import { updateProfile } from '../lib/api'

export default function DirectorProfileModal({ onClose }) {
  const session = useStore(s => s.session)
  const setSession = useStore(s => s.setSession)
  const [name, setName] = useState(session?.Name || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const isGoogleUser = !session?.Password

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
        password: password ? password.trim() : undefined,
      })

      setSession({
        ...session,
        Name: name.trim(),
        ProfilePic: `https://ui-avatars.com/api/?name=${encodeURIComponent(name.trim())}&background=155414&color=fff&size=80`,
      })

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 1200)
    } catch (err) {
      console.error(err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2.5">
            <i className="bi bi-person-circle text-white text-base" />
            <div>
              <p className="text-white font-bold text-sm leading-none">Edit Director Profile</p>
              <p className="text-green-300 text-[10px] mt-0.5">Change your name or update your password.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
              <i className="bi bi-exclamation-circle-fill flex-shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2">
              <i className="bi bi-check-circle-fill flex-shrink-0" />Profile saved successfully.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                placeholder="Director name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            {!isGoogleUser ? (
              <>
                <div>
                  <label className="label">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Leave blank to keep current password"
                      className="input pr-10"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute inset-y-0 right-2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      className="input pr-10"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute inset-y-0 right-2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Google-managed account. Password changes are not available here.
              </div>
            )}

            <div className="flex gap-3 flex-col sm:flex-row">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5">
                {loading
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  : 'Save Changes'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
