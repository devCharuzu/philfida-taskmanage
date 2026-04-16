// Push Notification Manager
// Handles browser push notifications for real-time alerts

const PUSH_KEY = 'philfida_push_enabled'
const VAPID_KEY = 'philfida_vapid_key' // This should come from your backend

class PushNotificationManager {
  constructor() {
    this.subscription = null
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window
    this.permission = 'default'
  }

  // Check if push notifications are enabled
  isEnabled() {
    try {
      return localStorage.getItem(PUSH_KEY) === 'true'
    } catch {
      return false
    }
  }

  // Enable/disable push notifications
  setEnabled(enabled) {
    try {
      localStorage.setItem(PUSH_KEY, String(enabled))
      if (!enabled && this.subscription) {
        this.unsubscribe()
      }
    } catch (e) {
      console.warn('Failed to save push preference:', e)
    }
  }

  // Request notification permission
  async requestPermission() {
    if (!this.isSupported) {
      console.warn('Push notifications not supported')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      this.permission = permission
      return permission === 'granted'
    } catch (error) {
      console.error('Failed to request notification permission:', error)
      return false
    }
  }

  // Subscribe to push notifications
  async subscribe() {
    if (!this.isSupported) {
      console.warn('Push notifications not supported')
      return null
    }

    if (this.permission !== 'granted') {
      const granted = await this.requestPermission()
      if (!granted) return null
    }

    try {
      // Register service worker if not already registered
      const registration = await navigator.serviceWorker.register('/sw.js')
      
      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_KEY)
      })

      this.subscription = subscription
      this.setEnabled(true)
      
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription)
      
      return subscription
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      return null
    }
  }

  // Unsubscribe from push notifications
  async unsubscribe() {
    if (!this.subscription) return

    try {
      await this.subscription.unsubscribe()
      this.subscription = null
      this.setEnabled(false)
      
      // Remove subscription from server
      await this.removeSubscriptionFromServer()
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error)
    }
  }

  // Send subscription to server
  async sendSubscriptionToServer(subscription) {
    try {
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription,
          userId: this.getCurrentUserId()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send subscription to server')
      }
    } catch (error) {
      console.error('Failed to send subscription to server:', error)
    }
  }

  // Remove subscription from server
  async removeSubscriptionFromServer() {
    try {
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.getCurrentUserId()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to remove subscription from server')
      }
    } catch (error) {
      console.error('Failed to remove subscription from server:', error)
    }
  }

  // Get current user ID (this should be implemented based on your auth system)
  getCurrentUserId() {
    // This should get the current user ID from your auth system
    // For now, return null - you'll need to implement this
    return null
  }

  // Show a local notification (fallback)
  showLocalNotification(title, options = {}) {
    if (!('Notification' in window)) return

    if (Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'philfida-notification',
        renotify: true,
        requireInteraction: false,
        ...options
      })
    }
  }

  // Convert VAPID key from base64 to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }
}

// Create singleton instance
export const pushManager = new PushNotificationManager()

// Export convenience functions
export async function initializePushNotifications() {
  if (!pushManager.isSupported) {
    console.log('Push notifications not supported on this device')
    return false
  }

  if (pushManager.isEnabled()) {
    return await pushManager.subscribe()
  }
  
  return null
}

export function showNotification(title, body, options = {}) {
  // Try push notification first, fallback to local
  if (pushManager.isEnabled()) {
    // Push notifications are handled by service worker
  } else {
    pushManager.showLocalNotification(title, {
      body,
      ...options
    })
  }
}
