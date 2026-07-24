import { useState } from 'react'
import { createPortal } from 'react-dom'
import { isSoundEnabled, setSoundEnabled, playNotifSound } from '../lib/notifSound'
import { updateDirectorSignatory, hasSupabaseAuthSession } from '../lib/api'
import { useStore } from '../store/useStore'
import DirectorPasswordModal from './DirectorPasswordModal'

export default function SettingsModal({ onClose, session }) {
  const updateSession = useStore(s => s.updateSession)
  const [soundOn, setSoundOn] = useState(isSoundEnabled())

  // Routing-slip signatory (Director only) — unchecked means a custom
  // person is on file (SignatoryName/Designation already set), checked
  // means "use my own account name/designation" (no override on file).
  const [useOwnName, setUseOwnName] = useState(!session?.SignatoryName)
  const [signatoryName, setSignatoryName] = useState(session?.SignatoryName || '')
  const [signatoryDesignation, setSignatoryDesignation] = useState(session?.SignatoryDesignation || '')
  const [savingSignatory, setSavingSignatory] = useState(false)
  const [signatorySaved, setSignatorySaved] = useState(false)
  const [signatoryError, setSignatoryError] = useState('')
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)

  function toggleSound(val) {
    setSoundOn(val)
    setSoundEnabled(val)
    if (val) setTimeout(() => playNotifSound(), 100) // preview after state settles
  }

  async function submitSignatory(password) {
    const name = useOwnName ? null : signatoryName.trim()
    const designation = useOwnName ? null : signatoryDesignation.trim()
    setSavingSignatory(true)
    try {
      await updateDirectorSignatory(session.ID, name, designation, password)
      updateSession({ SignatoryName: name, SignatoryDesignation: designation })
      setShowPasswordConfirm(false)
      setSignatorySaved(true)
      setTimeout(() => setSignatorySaved(false), 2500)
    } catch (err) {
      setSignatoryError(err.message || 'Failed to save. Please try again.')
    } finally {
      setSavingSignatory(false)
    }
  }

  async function handleSaveClick() {
    setSignatoryError('')
    if (!useOwnName && !signatoryName.trim()) {
      setSignatoryError('Enter a signatory name, or check "Use my account name" instead.')
      return
    }
    // Google-auth directors verify via JWT email inside the RPC — no password step needed.
    if (await hasSupabaseAuthSession()) {
      submitSignatory('')
    } else {
      setShowPasswordConfirm(true)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden settings-modal">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-start gap-4">
            <i className="bi bi-gear-fill text-white text-base" />
            <div>
              <p className="text-white font-bold text-sm leading-none mb-0">Settings</p>
              <p className="text-green-300 text-[10px] leading-none mt-0.5">Manage your app preferences.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5">

          {/* Notifications section */}
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Notifications</p>

          {/* Sound toggle row */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${soundOn ? 'bg-green-100' : 'bg-slate-100'}`}>
                <i className={`bi text-base ${soundOn ? 'bi-volume-up-fill text-green-700' : 'bi-volume-mute-fill text-slate-400'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Notification Sound</p>
                <p className="text-xs text-slate-400 mt-0.5">{soundOn ? 'Chime plays on new alerts' : 'Sound is muted'}</p>
              </div>
            </div>

            <button
              onClick={() => toggleSound(!soundOn)}
              className={`relative w-14 h-7 rounded-full transition-all duration-200 flex items-center toggle-switch ${soundOn ? 'bg-green-600' : 'bg-slate-300'}`}
              role="switch"
              aria-checked={soundOn}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${soundOn ? 'translate-x-7' : 'translate-x-0'}`} />
              <span className={`absolute text-[9px] font-semibold transition-opacity duration-200 ${soundOn ? 'left-2.5 text-white opacity-100' : 'right-2.5 text-slate-600 opacity-100'}`}>
                {soundOn ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          {/* Preview button */}
          {soundOn && (
            <button onClick={() => playNotifSound()}
              className="mt-2 w-full flex items-center justify-center gap-2 text-xs text-green-700 hover:text-green-900 font-semibold py-2 rounded-lg hover:bg-green-50 transition-colors">
              <i className="bi bi-play-circle-fill" /> Preview sound
            </button>
          )}

          {/* Routing Slip Signatory — Director only */}
          {session?.Role === 'Director' && (
            <>
              <div className="border-t border-slate-100 mt-5 pt-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Routing Slip Signatory</p>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={useOwnName}
                  onChange={e => setUseOwnName(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Use my account name and designation</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {useOwnName
                      ? `Print slips will be signed "${session?.Name || 'your account name'}" — ${session?.Designation || 'your designation'}.`
                      : 'Unchecked — type a different signatory below.'}
                  </p>
                </div>
              </label>

              {!useOwnName && (
                <div className="mt-2.5 space-y-2.5 p-3.5 rounded-xl border border-slate-200 bg-white">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Signatory Name</label>
                    <input
                      value={signatoryName}
                      onChange={e => setSignatoryName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Designation</label>
                    <input
                      value={signatoryDesignation}
                      onChange={e => setSignatoryDesignation(e.target.value)}
                      placeholder="e.g. OIC-Regional Director"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                    />
                  </div>
                </div>
              )}

              {signatoryError && <p className="text-xs text-red-600 font-semibold mt-2">{signatoryError}</p>}

              <button
                onClick={handleSaveClick}
                disabled={savingSignatory}
                className="mt-2.5 w-full flex items-center justify-center gap-2 text-sm font-bold text-white py-2.5 rounded-lg btn-primary-gradient disabled:opacity-60 transition-colors"
              >
                {savingSignatory
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Saving...</>
                  : signatorySaved
                    ? <><i className="bi bi-check-lg" /> Saved</>
                    : 'Save Signatory'}
              </button>
            </>
          )}

          <p className="text-[10px] text-slate-300 text-center mt-5">Settings are saved on this device</p>
        </div>
      </div>

      {showPasswordConfirm && (
        <DirectorPasswordModal
          icon="bi-pen-fill"
          title="Save Signatory"
          subtitle="Confirm to update the routing slip signatory"
          theme="success"
          confirmLabel="Save"
          confirmIcon="bi-check-lg"
          loading={savingSignatory}
          onCancel={() => setShowPasswordConfirm(false)}
          onConfirm={submitSignatory}
        />
      )}
    </div>,
    document.body
  )
}