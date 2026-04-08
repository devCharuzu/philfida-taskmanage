import { useState } from 'react'
import { isSoundEnabled, setSoundEnabled, playNotifSound } from '../lib/notifSound'

export default function SettingsModal({ onClose, session }) {
  const [soundOn, setSoundOn] = useState(isSoundEnabled())

  function toggleSound(val) {
    setSoundOn(val)
    setSoundEnabled(val)
    if (val) setTimeout(() => playNotifSound(), 100) // preview after state settles
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2.5">
            <i className="bi bi-gear-fill text-white text-sm" />
            <p className="text-white font-bold text-sm">Settings</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none w-7 h-7 flex items-center justify-center">&times;</button>
        </div>

        <div className="p-5">

          {/* Account card */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-5">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(session?.Name||'')}&background=155414&color=fff&size=80`}
              className="w-10 h-10 rounded-xl flex-shrink-0"
              alt={session?.Name}
            />
            <div className="min-w-0">
              <p className="font-bold text-green-900 text-sm truncate">{session?.Name}</p>
              <p className="text-slate-400 text-xs mt-0.5">{session?.Role} · {session?.Unit || session?.Office}</p>
            </div>
          </div>

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
              className={`relative w-16 h-8 rounded-full transition-all duration-200 flex items-center px-1 ${soundOn ? 'bg-green-600' : 'bg-slate-300'}`}
              role="switch"
              aria-checked={soundOn}
            >
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${soundOn ? 'translate-x-8' : 'translate-x-0'}`} />
              <span className="absolute left-3 text-[10px] text-white font-semibold">{soundOn ? 'On' : 'Off'}</span>
            </button>
          </div>

          {/* Preview button */}
          {soundOn && (
            <button onClick={() => playNotifSound()}
              className="mt-2 w-full flex items-center justify-center gap-2 text-xs text-green-700 hover:text-green-900 font-semibold py-2 rounded-lg hover:bg-green-50 transition-colors">
              <i className="bi bi-play-circle-fill" /> Preview sound
            </button>
          )}

          <p className="text-[10px] text-slate-300 text-center mt-5">Settings are saved on this device</p>
        </div>
      </div>
    </div>
  )
}