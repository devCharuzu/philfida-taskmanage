// Desktop / OS-level notifications.
//
// Two delivery paths, both landing in the same service worker:
//   1. Local  — the tab is open (possibly backgrounded); useSync spots a new
//               unread row and asks the worker to show it.
//   2. Push   — the browser may be closed entirely; the push service wakes the
//               worker. Requires a subscription (below) and the /api/push/send
//               function to actually deliver it.
//
// Notifications are shown through ServiceWorkerRegistration.showNotification()
// rather than `new Notification()`, because Android Chrome throws
// "Illegal constructor" on the latter — that was why Android users saw nothing.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const notificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window

export function permissionState() {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission           // 'default' | 'granted' | 'denied'
}

let swReadyPromise = null

/** Registers the worker once and resolves to its registration. */
export function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!swReadyPromise) {
    swReadyPromise = navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch((e) => { console.warn('[PUSH] service worker registration failed:', e); return null })
  }
  return swReadyPromise
}

/** Must be called from a user gesture — Safari rejects it otherwise. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch (e) {
    console.warn('[PUSH] permission request failed:', e)
    return 'denied'
  }
}

/** Shows a notification now, via the worker so Android is covered. */
export async function showLocalNotification(title, body, url = '/') {
  if (permissionState() !== 'granted') return false
  const reg = await ensureServiceWorker()
  const options = {
    body,
    icon: '/philfida-logo.png',
    badge: '/philfida-logo.png',
    tag: 'philfida-notification',
    renotify: true,
    data: { url },
  }
  try {
    if (reg) { await reg.showNotification(title, options); return true }
    // Desktop-only fallback for browsers without a worker.
    new Notification(title, options)
    return true
  } catch (e) {
    console.warn('[PUSH] could not show notification:', e)
    return false
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Current push subscription, or null. */
export async function getSubscription() {
  const reg = await ensureServiceWorker()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

/** Subscribes this device for push. Returns the subscription JSON or null. */
export async function subscribeToPush() {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return null
  const reg = await ensureServiceWorker()
  if (!reg) return null
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing.toJSON()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    return sub.toJSON()
  } catch (e) {
    console.warn('[PUSH] subscribe failed:', e)
    return null
  }
}

export async function unsubscribeFromPush() {
  const sub = await getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* already gone */ }
  return endpoint
}
