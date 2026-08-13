import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { markNotificationRead, markNotificationsRead, clearNotifications, markChatRead } from '../lib/api'
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

  // Type reads as a small colored dot, not an icon — the message text already
  // carries its own leading emoji (stripped below), so an icon avatar too was a double-icon row.
  const getNotificationDot = (type) => {
    switch (type) {
      case 'task': return 'bg-blue-500'
      case 'chat': return 'bg-green-500'
      default:     return 'bg-slate-400'
    }
  }

  const EMOJI_PREFIX = /^\p{Emoji_Presentation}\s*/u
  const stripEmoji = (text) => text.replace(EMOJI_PREFIX, '')

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

  // A chat notification and the underlying chat's unread badge are two separate
  // "read" flags (Notifications.IsRead vs Comments.HiddenBy) tracking the same event.
  // ChatModal already clears the notification when the chat is opened; this is the
  // other direction — reading the notification clears the chat's unread badge too.
  function markChatReadForTaskIds(taskIds) {
    if (!taskIds.length) return
    const currentData = useStore.getState().globalData
    setGlobalData({
      ...currentData,
      comments: currentData.comments.map(c =>
        taskIds.includes(String(c.TaskID)) &&
        c.SenderName !== session.Name &&
        !String(c.HiddenBy || '').includes(session.Name)
          ? { ...c, HiddenBy: c.HiddenBy ? `${c.HiddenBy},${session.Name}` : session.Name }
          : c
      ),
    })
    taskIds.forEach(id => markChatRead(id, session.Name))
  }

  function handleNotificationClick(notification) {
    if (notification.Type === 'chat' && notification.TaskID) {
      markChatReadForTaskIds([String(notification.TaskID)])
    }
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

  // Viewing the list counts as reading it — clears the red-dot badge as soon as
  // the dropdown is open, without requiring a click on every single item. Any
  // unread chat notifications cascade into clearing their chat's unread badge too.
  useEffect(() => {
    if (!open || unread.length === 0) return
    const chatTaskIds = [...new Set(
      unread.filter(n => n.Type === 'chat' && n.TaskID).map(n => String(n.TaskID))
    )]
    markChatReadForTaskIds(chatTaskIds)
    markAllRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  async function markAllRead() {
    await markNotificationsRead(session.ID)
    const current = useStore.getState().globalData
    setGlobalData({ ...current, notifications: current.notifications.map(n => ({ ...n, IsRead: 'TRUE' })) })
  }

  async function handleMarkAllRead() {
    setBusy(true)
    await markAllRead()
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
              <span className="font-bold text-sm text-slate-900">Notifications</span>
              {unread.length > 0 && (
                <span className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{unread.length}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {unread.length > 0 && (
                <button onClick={handleMarkAllRead} disabled={busy}
                  className="text-xs font-medium text-slate-500 hover:text-green-700 transition-colors disabled:opacity-50">
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={handleClear} disabled={busy}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50">
                  Clear
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
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 flex-shrink-0">
              {[
                { key: 'all',    label: 'All',    count: notifications.length },
                { key: 'unread', label: 'Unread', count: unread.length },
                { key: 'task',   label: 'Tasks',  count: notifications.filter(n => n.Type === 'task').length },
                { key: 'chat',   label: 'Chat',   count: notifications.filter(n => n.Type === 'chat').length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    filter === key
                      ? 'bg-green-50 text-green-700'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {label}{count > 0 ? ` · ${count > 99 ? '99+' : count}` : ''}
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
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0 ${getNotificationDot(n.Type)}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className={`leading-snug ${n.IsRead === 'FALSE' ? 'font-medium text-slate-800' : 'font-normal text-slate-600'}`}>
                        {stripEmoji(n.Message)}
                      </p>
                      <p className="text-slate-400 text-[11px] mt-1">{formatDate(n.CreatedAt)}</p>
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
