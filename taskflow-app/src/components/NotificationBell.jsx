import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { markNotificationRead, markNotificationsRead, clearNotifications } from '../lib/api'
import { useStore } from '../store/useStore'

export default function NotificationBell() {
  const [open,      setOpen]      = useState(false)
  const [ringing,   setRinging]   = useState(false)
  const [pos,       setPos]       = useState({ top: 0, left: 0, maxHeight: 480 })
  const [busy,      setBusy]      = useState(false)
  const [filter,    setFilter]    = useState('all') // all, unread, task, chat
  const [search,    setSearch]    = useState('')

  const btnRef    = useRef()
  const portalRef = useRef()
  const firstPulseRef = useRef(true)

  const session       = useStore(s => s.session)
  const globalData    = useStore(s => s.globalData)
  const setGlobalData = useStore(s => s.setGlobalData)
  const notifyPulse   = useStore(s => s.notifyPulse)
  const notifications = globalData.notifications
  const unread         = notifications.filter(n => n.IsRead === 'FALSE')

  const filteredNotifications = notifications.filter(n => {
    const matchesFilter = (() => {
      switch (filter) {
        case 'unread': return n.IsRead === 'FALSE'
        case 'task':   return n.Type === 'task'
        case 'chat':   return n.Type === 'chat'
        default:       return true
      }
    })()
    const matchesSearch = !search.trim() || n.Message.toLowerCase().includes(search.trim().toLowerCase())
    return matchesFilter && matchesSearch
  })

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task': return 'bi-clipboard-check'
      case 'chat': return 'bi-chat-dots'
      default:     return 'bi-info-circle'
    }
  }

  const getNotificationColor = (type) => {
    switch (type) {
      case 'task': return 'text-blue-600 bg-blue-50'
      case 'chat': return 'text-green-600 bg-green-50'
      default:     return 'text-slate-500 bg-slate-100'
    }
  }

  function formatDate(dateString) {
    const diffMs = Date.now() - new Date(dateString)
    const mins  = Math.floor(diffMs / 60000)
    const hours = Math.floor(diffMs / 3600000)
    const days  = Math.floor(diffMs / 86400000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(dateString).toLocaleDateString()
  }

  function handleNotificationClick(notification) {
    if (notification.IsRead === 'FALSE') {
      markNotificationRead(notification.ID).then(() => {
        const currentData = useStore.getState().globalData
        setGlobalData({
          ...currentData,
          notifications: currentData.notifications.map(n =>
            n.ID === notification.ID ? { ...n, IsRead: 'TRUE' } : n
          ),
        })
      })
    }
  }

  // Bell-icon ring animation — driven by the shared pulse bumped once, in one
  // place (useSync), so it fires once per new notification regardless of how
  // many NotificationBell instances are mounted on the page.
  useEffect(() => {
    if (firstPulseRef.current) { firstPulseRef.current = false; return }
    setRinging(true)
    const t = setTimeout(() => setRinging(false), 1000)
    return () => clearTimeout(t)
  }, [notifyPulse])

  // ── Close on outside click ───────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        if (portalRef.current && portalRef.current.contains(e.target)) return
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

    let left = rect.right - dropdownWidth
    if (left < 8) left = 8
    if (left + dropdownWidth > window.innerWidth - 8) {
      left = window.innerWidth - dropdownWidth - 8
    }

    setPos({ top: rect.bottom + 8, left, maxHeight: dropdownHeight })
    setOpen(true)
  }

  async function handleMarkAllRead() {
    setBusy(true)
    await markNotificationsRead(session.ID)
    setGlobalData({ ...globalData, notifications: notifications.map(n => ({ ...n, IsRead: 'TRUE' })) })
    setBusy(false)
  }

  async function handleClear() {
    setBusy(true)
    await clearNotifications(session.ID)
    setGlobalData({ ...globalData, notifications: [] })
    setBusy(false)
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
        .nd-in { animation:nd-in 0.15s ease; }
      `}</style>

      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 border border-white/15 text-green-200 hover:text-white hover:bg-white/20 transition-colors"
        aria-label="Notifications"
      >
        <i className={`bi bi-bell-fill text-base inline-block ${ringing ? 'bell-ring' : ''}`} />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-green-900">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={portalRef} className="nd-in fixed bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col z-modal"
          style={{ top: pos.top, left: pos.left, width: Math.min(360, window.innerWidth - 16), maxHeight: `calc(100vh - ${pos.top}px - 16px)` }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-800">Notifications</span>
              {unread.length > 0 && (
                <span className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{unread.length}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread.length > 0 && (
                <button onClick={handleMarkAllRead} disabled={busy} title="Mark all as read"
                  className="p-1.5 text-slate-400 hover:text-green-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50">
                  <i className="bi bi-check2-all" />
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={handleClear} disabled={busy} title="Clear all"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50">
                  <i className="bi bi-trash3" />
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          {notifications.length > 0 && (
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 flex-shrink-0">
              <div className="relative">
                <i className="bi bi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                />
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          {notifications.length > 0 && (
            <div className="grid grid-cols-4 border-b border-slate-100 flex-shrink-0">
              {[
                { key: 'all',    label: 'All',    count: notifications.length },
                { key: 'unread', label: 'Unread', count: unread.length },
                { key: 'task',   label: 'Tasks',  count: notifications.filter(n => n.Type === 'task').length },
                { key: 'chat',   label: 'Chat',   count: notifications.filter(n => n.Type === 'chat').length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-1 py-2 text-[11px] font-medium transition-colors border-b-2 flex items-center justify-center gap-1 ${
                    filter === key
                      ? 'text-green-700 border-green-600'
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}
                >
                  {label}
                  {count > 0 && <span className="text-slate-400">{count > 99 ? '99+' : count}</span>}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto divide-y divide-slate-50 flex-1">
            {filteredNotifications.length === 0
              ? (
                <div className="text-center text-slate-400 text-sm py-10">
                  <i className="bi bi-bell-slash text-2xl block mb-2 opacity-30" />
                  {notifications.length === 0 ? 'No notifications yet' : 'No matches'}
                </div>
              )
              : filteredNotifications.map(n => (
                <div
                  key={n.ID}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 text-sm cursor-pointer border-l-[3px] transition-colors ${
                    n.IsRead === 'FALSE'
                      ? 'bg-green-50/60 border-l-green-600 hover:bg-green-50'
                      : 'border-l-transparent hover:bg-slate-50'
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
                      <p className="text-slate-400 text-xs mt-1">{formatDate(n.CreatedAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
