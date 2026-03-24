import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { markNotificationsRead, clearNotifications } from '../lib/api'
import { useStore } from '../store/useStore'
import { playNotifSound, unlockAudio } from '../lib/notifSound'

export default function NotificationBell() {
  const [open,     setOpen]    = useState(false)
  const [ringing,  setRinging] = useState(false)
  const [pos,      setPos]     = useState({ top: 0, left: 0 })
  const [clearing, setClearing]= useState(false)

  const btnRef       = useRef()
  const seenIdsRef   = useRef(null)   // Set of IDs we've already seen — null = first load

  const session       = useStore(s => s.session)
  const globalData    = useStore(s => s.globalData)
  const setGlobalData = useStore(s => s.setGlobalData)
  const notifications = globalData.notifications
  const unread        = notifications.filter(n => n.IsRead === 'FALSE')

  // ── Sound: fire when a truly NEW notification ID appears ────
  useEffect(() => {
    const currentIds = new Set(notifications.map(n => String(n.ID)))

    if (seenIdsRef.current === null) {
      // First load — just baseline, no sound
      seenIdsRef.current = currentIds
      return
    }

    // Check for any ID we haven't seen before
    let hasNew = false
    currentIds.forEach(id => {
      if (!seenIdsRef.current.has(id)) hasNew = true
    })

    if (hasNew) {
      unlockAudio()
      playNotifSound()
      setRinging(true)
      setTimeout(() => setRinging(false), 1000)
    }

    seenIdsRef.current = currentIds
  }, [notifications])

  // ── Auto mark as read when opened ───────────────────────────
  useEffect(() => {
    if (!open || unread.length === 0) return
    markNotificationsRead(session.ID).then(() => {
      setGlobalData({
        ...globalData,
        notifications: notifications.map(n => ({ ...n, IsRead: 'TRUE' })),
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Close on outside click ───────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        const portal = document.getElementById('notif-portal')
        if (portal && portal.contains(e.target)) return
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Position portal ──────────────────────────────────────────
  function openDropdown() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const W    = Math.min(320, window.innerWidth - 16)  // clamp to screen - 8px each side
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))
    setPos({ top: rect.bottom + 8, left })
    setOpen(true)
  }

  // ── Clear all ────────────────────────────────────────────────
  async function handleClear() {
    setClearing(true)
    await clearNotifications(session.ID)
    setGlobalData({ ...globalData, notifications: [] })
    seenIdsRef.current = new Set()
    setClearing(false)
    setOpen(false)
  }

  return (
    <>
      <style>{`
        @keyframes bell-ring {
          0%,100%{ transform:rotate(0) }
          15%    { transform:rotate(18deg) }  30% { transform:rotate(-14deg) }
          45%    { transform:rotate(10deg) }  60% { transform:rotate(-8deg) }
          75%    { transform:rotate(5deg)  }  90% { transform:rotate(-3deg) }
        }
        .bell-ring { animation:bell-ring 0.8s ease; transform-origin:top center; }
        @keyframes nd-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .nd-in { animation:nd-in 0.18s ease; }
      `}</style>

      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="relative p-2 text-green-200 hover:text-white transition-colors"
      >
        <i className={`bi bi-bell-fill text-lg inline-block ${ringing ? 'bell-ring' : ''}`} />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-green-900">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <div id="notif-portal" className="nd-in fixed bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: Math.min(320, window.innerWidth - 16), zIndex: 99999 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-green-50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-green-900">Notifications</span>
              {unread.length > 0 && (
                <span className="text-xs bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">{unread.length}</span>
              )}
            </div>
            {notifications.length > 0 && (
              <button onClick={handleClear} disabled={clearing}
                className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 transition-colors">
                {clearing
                  ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-500 rounded-full animate-spin inline-block" />
                  : <><i className="bi bi-trash3" /> Clear all</>}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0
              ? (
                <div className="text-center text-slate-400 text-sm py-10">
                  <i className="bi bi-bell-slash text-2xl block mb-2 opacity-40" />
                  No notifications yet
                </div>
              )
              : notifications.map(n => (
                <div key={n.ID}
                  className={`px-4 py-3 text-sm transition-colors ${n.IsRead === 'FALSE' ? 'bg-green-50 border-l-2 border-green-600' : 'hover:bg-slate-50'}`}>
                  <p className="text-slate-700 leading-snug">{n.Message}</p>
                  <p className="text-slate-400 text-xs mt-1">{new Date(n.CreatedAt).toLocaleString()}</p>
                </div>
              ))
            }
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-400 text-center">Viewing this panel marks all as read</p>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}