// Service worker for PHILFIDA TaskFlow — notifications only.
//
// Deliberately NOT a caching worker. The previous version pre-cached
// /static/js/bundle.js and /static/css/main.css (Create-React-App paths that
// do not exist in this Vite build), and cache.addAll() rejects atomically on a
// single 404 — so the worker could never finish installing. Its cache-first
// fetch handler would also have served stale HTML after every deploy. Both are
// removed; Vercel already handles asset caching.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ── Web Push (fires even when the browser is closed) ─────────────────────
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'PHILFIDA TaskFlow'
  const options = {
    body: payload.body || 'You have a new notification',
    icon: '/philfida-logo.png',
    badge: '/philfida-logo.png',
    // Same tag + renotify: a second alert replaces the first rather than
    // stacking, but still re-alerts the user.
    tag: payload.tag || 'philfida-notification',
    renotify: true,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Click → focus an existing tab if one is open, else open a new one ────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        // Match on origin, not the full URL — the app is a SPA, so any open
        // tab can be navigated rather than spawning a duplicate.
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined
    })
  )
})
