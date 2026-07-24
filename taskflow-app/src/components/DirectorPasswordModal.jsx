import { useState } from 'react'
import { createPortal } from 'react-dom'

// Same structure as the "Delete Account Permanently" confirm modal (header
// icon + title/subtitle, password field with show/hide, error line, Cancel +
// Confirm buttons) — reused wherever a Director action needs a password
// confirm, so every such popup looks and behaves the same. Only the color
// and copy vary per context.
const THEMES = {
  danger:  { header: 'bg-red-600',    sub: 'text-red-200',    btn: 'bg-red-600 hover:bg-red-700' },
  warning: { header: 'bg-amber-500',  sub: 'text-amber-100',  btn: 'bg-amber-600 hover:bg-amber-700' },
  success: { header: 'bg-green-700',  sub: 'text-green-200',  btn: 'bg-green-700 hover:bg-green-800' },
}

export default function DirectorPasswordModal({
  icon = 'bi-shield-lock-fill',
  title,
  subtitle,
  theme = 'success',
  confirmLabel = 'Confirm',
  confirmIcon = 'bi-check-lg',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const t = THEMES[theme] || THEMES.success

  function submit() {
    if (!password.trim()) { setError('Password is required.'); return }
    setError('')
    onConfirm(password.trim())
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-modal flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        <div className={`${t.header} px-5 py-4 flex items-center gap-3`}>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <i className={`bi ${icon} text-white text-lg`} />
          </div>
          <div>
            <p className="text-white font-bold text-sm">{title}</p>
            {subtitle && <p className={`${t.sub} text-xs mt-0.5`}>{subtitle}</p>}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Your Director Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password to confirm"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'}`} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-xs flex items-center gap-1">
              <i className="bi bi-exclamation-circle-fill" />{error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="btn-secondary flex-1 py-2.5">
              Cancel
            </button>
            <button onClick={submit}
              disabled={loading || !password.trim()}
              className={`${t.btn} flex-1 py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}>
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                : <><i className={`bi ${confirmIcon}`} /> {confirmLabel}</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
