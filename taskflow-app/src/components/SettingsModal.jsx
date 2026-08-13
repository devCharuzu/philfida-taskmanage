import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { isSoundEnabled, setSoundEnabled, playNotifSound } from '../lib/notifSound'
import {
  permissionState, requestPermission, subscribeToPush, unsubscribeFromPush,
  getSubscription, notificationsSupported, showLocalNotification,
} from '../lib/notifications'
import { savePushSubscription, removePushSubscription } from '../lib/api'
import { updateDirectorSignatory, hasSupabaseAuthSession } from '../lib/api'
import { useStore } from '../store/useStore'
import DirectorPasswordModal from './DirectorPasswordModal'

export default function SettingsModal({ onClose, session }) {
  const updateSession = useStore(s => s.updateSession)
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  const [desktopState, setDesktopState] = useState(permissionState())
  const [desktopBusy, setDesktopBusy] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [desktopNote, setDesktopNote] = useState('')

  // Permission can be changed in the browser's own site settings while this is
  // open, so re-read it whenever the window regains focus rather than trusting
  // the value captured at mount.
  useEffect(() => {
    let alive = true
    const refresh = () => { if (alive) setDesktopState(permissionState()) }
    refresh()
    getSubscription().then(sub => { if (alive) setPushSubscribed(!!sub) }).catch(() => {})
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Desktop alerts need only permission. A push subscription is a separate,
  // optional upgrade that additionally covers "browser fully closed" — treating
  // it as a requirement meant the toggle refused to move whenever push was not
  // configured yet, with no explanation.
  const desktopOn = desktopState === 'granted'

  // Permission must be requested from a user gesture — Safari refuses otherwise.
  async function toggleDesktop(next) {
    setDesktopBusy(true)
    setDesktopNote('')
    try {
      if (!next) {
        const endpoint = await unsubscribeFromPush()
        if (endpoint) await removePushSubscription(endpoint)
        setPushSubscribed(false)
        setDesktopNote('Background delivery off. To stop alerts entirely, block notifications for this site in your browser.')
        return
      }

      let state = permissionState()
      if (state === 'default') state = await requestPermission()
      setDesktopState(state)

      if (state === 'denied') {
        setDesktopNote('Your browser is blocking notifications for this site. Allow them in the address-bar site settings, then return here.')
        return
      }
      if (state !== 'granted') return

      // Alerts are live from here. Try to upgrade to push, but never let a
      // failure roll back what already works.
      const sub = await subscribeToPush()
      if (sub) {
        await savePushSubscription(session?.ID, sub)
        setPushSubscribed(true)
      } else {
        setDesktopNote('Alerts are on while TaskFlow is open in a tab. Delivery with the browser closed still needs push setup on the server.')
      }
    } catch (e) {
      console.error('[PUSH] toggle failed:', e)
      setDesktopNote(e?.message || 'Could not enable desktop alerts.')
    } finally {
      setDesktopBusy(false)
    }
  }

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

        {/* Header — same structure and metrics as the Travel/Leave modals */}
        <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-green-800">
          <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="bi bi-gear-fill text-white text-base" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Settings</p>
            <p className="mb-0 mt-0.5 text-green-100/80 text-[11px] font-medium leading-tight">Manage your app preferences</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <i className="bi bi-x-lg text-sm" />
          </button>
        </div>

        <div className="p-6">

          {/* Notifications section */}
          <p className="mb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notifications</p>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${soundOn ? 'bg-green-100' : 'bg-slate-100'}`}>
                <i className={`bi text-base ${soundOn ? 'bi-volume-up-fill text-green-700' : 'bi-volume-mute-fill text-slate-400'}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="mb-0 text-sm font-semibold text-slate-800 leading-tight">Notification sound</p>
                <p className="mb-0 mt-1 text-[11px] text-slate-500 leading-tight">{soundOn ? 'Chime plays on new alerts' : 'Muted — no chime on alerts'}</p>
              </div>
            </div>

            <button
              onClick={() => toggleSound(!soundOn)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${soundOn ? 'bg-green-600' : 'bg-slate-300'}`}
              role="switch"
              aria-checked={soundOn}
              aria-label="Notification sound"
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${soundOn ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {notificationsSupported() && (
            <div className="mt-2 rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${desktopOn ? 'bg-green-100' : 'bg-slate-100'}`}>
                    <i className={`bi text-base ${desktopOn ? 'bi-bell-fill text-green-700' : 'bi-bell-slash-fill text-slate-400'}`} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0 text-sm font-semibold text-slate-800 leading-tight">Desktop alerts</p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500 leading-snug">
                      {desktopState === 'denied'
                        ? 'Blocked by your browser for this site.'
                        : desktopOn
                          ? (pushSubscribed
                              ? 'On — reaches you even with the browser closed.'
                              : 'On while TaskFlow is open in a tab.')
                          : 'Get alerted while working in another tab or app.'}
                    </p>
                  </div>
                </div>
                {/* Deliberately still clickable when denied: pressing it explains
                    how to unblock, which a dead disabled switch never could. */}
                <button
                  onClick={() => toggleDesktop(!desktopOn)}
                  disabled={desktopBusy}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${desktopOn ? 'bg-green-600' : 'bg-slate-300'}`}
                  role="switch"
                  aria-checked={desktopOn}
                  aria-label="Desktop alerts"
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${desktopOn ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {desktopNote && (
                <p className="mb-0 mt-2.5 border-t border-slate-100 pt-2.5 text-[11px] leading-snug text-slate-500">
                  {desktopNote}
                </p>
              )}

              {desktopOn && (
                <button
                  onClick={() => showLocalNotification('PHILFIDA TaskFlow', 'Desktop alerts are working.')}
                  className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                >
                  Send a test alert
                </button>
              )}
            </div>
          )}

          {soundOn && (
            <button onClick={() => playNotifSound()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-50 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
              <i className="bi bi-play-circle-fill text-[11px]" aria-hidden="true" /> Preview sound
            </button>
          )}

          {/* Routing Slip Signatory — Director only */}
          {session?.Role === 'Director' && (
            <>
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="mb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Routing Slip Signatory</p>

                {/* The whole row is the control here, so hover feedback is honest. */}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5 transition-colors hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={useOwnName}
                    onChange={e => setUseOwnName(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-green-600"
                  />
                  <div className="min-w-0">
                    <p className="mb-0 text-sm font-semibold text-slate-800 leading-tight">Use my account name and designation</p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500 leading-snug">
                      {useOwnName
                        ? `Slips will be signed "${session?.Name || 'your account name'}" — ${session?.Designation || 'your designation'}.`
                        : 'Type a different signatory below.'}
                    </p>
                  </div>
                </label>

                {!useOwnName && (
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-slate-200 p-3.5">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Signatory name</label>
                    <input
                      value={signatoryName}
                      onChange={e => setSignatoryName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                    />
                  </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Designation</label>
                    <input
                      value={signatoryDesignation}
                      onChange={e => setSignatoryDesignation(e.target.value)}
                      placeholder="e.g. OIC-Regional Director"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                    />
                  </div>
                  </div>
                )}

                {signatoryError && <p className="mb-0 mt-2 text-[11px] font-semibold text-red-600">{signatoryError}</p>}

                <button
                  onClick={handleSaveClick}
                  disabled={savingSignatory}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white btn-primary-gradient transition-colors disabled:opacity-60"
                >
                  {savingSignatory
                    ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Saving…</>
                    : signatorySaved
                      ? <><i className="bi bi-check-lg" aria-hidden="true" /> Saved</>
                      : 'Save signatory'}
                </button>
              </div>
            </>
          )}

          {/* slate-300 on white is roughly 1.9:1 — below any legibility floor. */}
          <p className="mb-0 mt-6 text-center text-[10px] text-slate-400">Settings are saved on this device</p>
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