import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { isSoundEnabled, setSoundEnabled, playNotifSound } from '../lib/notifSound'
import {
  permissionState, requestPermission, subscribeToPush, unsubscribeFromPush,
  getSubscription, notificationsSupported, showLocalNotification,
} from '../lib/notifications'
import { savePushSubscription, removePushSubscription } from '../lib/api'
import { useStore } from '../store/useStore'

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

  function toggleSound(val) {
    setSoundOn(val)
    setSoundEnabled(val)
    if (val) setTimeout(() => playNotifSound(), 100) // preview after state settles
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

          {/* slate-300 on white is roughly 1.9:1 — below any legibility floor. */}
          <p className="mb-0 mt-6 text-center text-[10px] text-slate-400">Settings are saved on this device</p>
        </div>
      </div>

    </div>,
    document.body
  )
}