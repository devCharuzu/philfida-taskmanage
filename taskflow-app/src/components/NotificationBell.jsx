import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { markNotificationsRead, clearNotifications } from '../lib/api'
import { useStore } from '../store/useStore'
import { playNotifSound, unlockAudio } from '../lib/notifSound'
import { showNotification } from '../lib/pushNotifications'
import NotificationCenter from './NotificationCenter'

export default function NotificationBell() {
  const [open,     setOpen]    = useState(false)
  const [ringing,  setRinging] = useState(false)
  const [pos,      setPos]     = useState({ top: 0, left: 0, maxHeight: 480 })
  const [clearing, setClearing]= useState(false)
  const [filter,   setFilter]  = useState('all') // all, unread, task, chat, system
  const [showCenter, setShowCenter] = useState(false)

  const btnRef       = useRef()
  const seenIdsRef   = useRef(null)   // Set of IDs we've already seen — null = first load

  const session       = useStore(s => s.session)
  const globalData    = useStore(s => s.globalData)
  const setGlobalData = useStore(s => s.setGlobalData)
  const notifications = globalData.notifications
  const unread        = notifications.filter(n => n.IsRead === 'FALSE')

  // Filter notifications based on selected filter
  const filteredNotifications = notifications.filter(n => {
    switch (filter) {
      case 'unread':
        return n.IsRead === 'FALSE'
      case 'task':
        return n.Type === 'task'
      case 'chat':
        return n.Type === 'chat'
      case 'system':
        return n.Type === 'info' || n.Type === 'system'
      default:
        return true
    }
  })

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task':
        return 'bi-clipboard-check'
      case 'chat':
        return 'bi-chat-dots'
      case 'info':
      case 'system':
        return 'bi-info-circle'
      default:
        return 'bi-bell'
    }
  }

  // Get notification color based on type
  const getNotificationColor = (type) => {
    switch (type) {
      case 'task':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'chat':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'info':
      case 'system':
        return 'text-gray-600 bg-gray-50 border-gray-200'
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200'
    }
  }

  // Handle individual notification click
  const handleNotificationClick = (notification) => {
    // Mark as read if unread
    if (notification.IsRead === 'FALSE') {
      markNotificationsRead(session.ID).then(() => {
        setGlobalData({
          ...globalData,
          notifications: notifications.map(n => 
            n.ID === notification.ID ? { ...n, IsRead: 'TRUE' } : n
          ),
        })
      })
    }

    // Navigate to relevant page if task notification
    if (notification.Type === 'task' && notification.TaskID) {
      // This would navigate to the task detail page
      // For now, just close the dropdown
      setOpen(false)
    }
  }

  // ── Sound: fire when a truly NEW unread notification ID appears ──
  useEffect(() => {
    const currentIds = new Set(unread.map(n => String(n.ID)))

    if (seenIdsRef.current === null) {
      // First load — just baseline, no sound
      seenIdsRef.current = currentIds
      return
    }

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
  }, [unread])

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
    const dropdownWidth = Math.min(360, window.innerWidth - 16)
    const dropdownHeight = Math.min(480, window.innerHeight - rect.bottom - 16)
    
    // Calculate left position - prefer right-aligned to button, but keep in bounds
    let left = rect.right - dropdownWidth
    // If that puts it off-screen left, align to left edge with margin
    if (left < 8) left = 8
    // If bell is on right side and dropdown would overflow right, align to right of screen
    if (left + dropdownWidth > window.innerWidth - 8) {
      left = window.innerWidth - dropdownWidth - 8
    }
    
    setPos({ top: rect.bottom + 8, left, maxHeight: dropdownHeight })
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
        <div id="notif-portal" className="nd-in fixed bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          style={{ top: pos.top, left: pos.left, width: Math.min(360, window.innerWidth - 16), maxHeight: `calc(100vh - ${pos.top}px - 16px)`, zIndex: 99999 }}>

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

          {/* Filter Tabs */}
          {notifications.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100 bg-slate-50">
              {[
                { key: 'all', label: 'All', count: notifications.length },
                { key: 'unread', label: 'Unread', count: unread.length },
                { key: 'task', label: 'Tasks', count: notifications.filter(n => n.Type === 'task').length },
                { key: 'chat', label: 'Chat', count: notifications.filter(n => n.Type === 'chat').length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1 ${
                    filter === key
                      ? 'text-green-600 border-green-600 bg-white'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px]">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto divide-y divide-slate-50 flex-1" style={{ maxHeight: 'min(320px, calc(100vh - 200px))' }}>
            {filteredNotifications.length === 0
              ? (
                <div className="text-center text-slate-400 text-sm py-10">
                  <i className="bi bi-funnel text-2xl block mb-2 opacity-40" />
                  {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
                </div>
              )
              : filteredNotifications.map(n => (
                <div
                  key={n.ID}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 text-sm transition-all cursor-pointer ${
                    n.IsRead === 'FALSE' 
                      ? 'bg-green-50 border-l-4 border-green-600 hover:bg-green-100' 
                      : 'hover:bg-slate-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getNotificationColor(n.Type)}`}>
                      <i className={`bi ${getNotificationIcon(n.Type)} text-sm`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-slate-700 leading-snug ${n.IsRead === 'FALSE' ? 'font-semibold' : ''}`}>
                        {n.Message}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        {new Date(n.CreatedAt).toLocaleString()}
                      </p>
                    </div>
                    {n.IsRead === 'FALSE' && (
                      <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <button
              onClick={() => {
                setShowCenter(true)
                setOpen(false)
              }}
              className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <i className="bi bi-calendar3" />
              View All Notifications
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Notification Center Modal */}
      <NotificationCenter 
        isOpen={showCenter} 
        onClose={() => setShowCenter(false)} 
      />
    </>
  )
}