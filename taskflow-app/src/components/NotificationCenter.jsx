import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { markNotificationsRead, clearNotifications } from '../lib/api'
import { useStore } from '../store/useStore'

export default function NotificationCenter({ isOpen, onClose }) {
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  
  const session = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const setGlobalData = useStore(s => s.setGlobalData)
  const notifications = globalData.notifications || []

  // Filter and search notifications
  const filteredNotifications = notifications.filter(n => {
    const matchesFilter = () => {
      switch (filter) {
        case 'unread':
          return n.IsRead === 'FALSE'
        case 'read':
          return n.IsRead === 'TRUE'
        case 'task':
          return n.Type === 'task'
        case 'chat':
          return n.Type === 'chat'
        case 'system':
          return n.Type === 'info' || n.Type === 'system'
        default:
          return true
      }
    }

    const matchesSearch = () => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return n.Message.toLowerCase().includes(query) ||
             n.Type.toLowerCase().includes(query)
    }

    return matchesFilter() && matchesSearch()
  })

  // Get notification icon and color
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

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await markNotificationsRead(session.ID)
      setGlobalData({
        ...globalData,
        notifications: notifications.map(n => 
          n.ID === notificationId ? { ...n, IsRead: 'TRUE' } : n
        ),
      })
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    setLoading(true)
    try {
      await markNotificationsRead(session.ID)
      setGlobalData({
        ...globalData,
        notifications: notifications.map(n => ({ ...n, IsRead: 'TRUE' })),
      })
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    } finally {
      setLoading(false)
    }
  }

  // Clear all notifications
  const clearAllNotifications = async () => {
    if (!confirm('Are you sure you want to clear all notifications?')) return
    
    setLoading(true)
    try {
      await clearNotifications(session.ID)
      setGlobalData({ ...globalData, notifications: [] })
    } catch (error) {
      console.error('Failed to clear notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  // Delete individual notification
  const deleteNotification = async (notificationId) => {
    try {
      // This would need to be implemented in the API
      // await deleteNotification(notificationId)
      setGlobalData({
        ...globalData,
        notifications: notifications.filter(n => n.ID !== notificationId),
      })
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const unreadCount = notifications.filter(n => n.IsRead === 'FALSE').length

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Notification Center</h2>
            <p className="text-sm text-slate-500 mt-1">
              {unreadCount} unread • {notifications.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Marking...' : 'Mark all read'}
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <i className="bi bi-x-lg text-xl" />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <i className="bi bi-search absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Notifications</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="task">Tasks</option>
              <option value="chat">Chat</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <i className="bi bi-bell-slash text-4xl text-slate-300 mb-4 block" />
              <p className="text-slate-500">
                {searchQuery || filter !== 'all' 
                  ? 'No notifications match your filters' 
                  : 'No notifications yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.ID}
                  className={`p-4 hover:bg-slate-50 transition-colors ${
                    notification.IsRead === 'FALSE' ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getNotificationColor(notification.Type)}`}>
                      <i className={`bi ${getNotificationIcon(notification.Type)} text-lg`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`text-slate-900 leading-snug ${
                            notification.IsRead === 'FALSE' ? 'font-semibold' : ''
                          }`}>
                            {notification.Message}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-500">
                              {formatDate(notification.CreatedAt)}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${getNotificationColor(notification.Type)}`}>
                              {notification.Type}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {notification.IsRead === 'FALSE' && (
                            <button
                              onClick={() => markAsRead(notification.ID)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Mark as read"
                            >
                              <i className="bi bi-check2 text-sm" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.ID)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete notification"
                          >
                            <i className="bi bi-trash text-sm" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500 text-center">
            Showing {filteredNotifications.length} of {notifications.length} notifications
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
