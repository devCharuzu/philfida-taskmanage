// POST /api/push-send   body: { notificationId: number }
//
// Delivers an existing Notifications row to that user's registered devices.
//
// Security: the caller supplies only a row id — never a recipient or a message
// body. The server reads both from the database with the service-role key, so
// this endpoint cannot be used to push arbitrary text to arbitrary people. The
// worst an abuser can do is re-deliver a real notification to the person it
// already belongs to.
//
// Env (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                 same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Settings → API → service_role
//   VAPID_PUBLIC_KEY             same value as VITE_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY            keep secret — never prefix with VITE_
//   VAPID_SUBJECT                e.g. mailto:admin@philfida.gov.ph

import webpush from 'web-push'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:admin@philfida.gov.ph',
} = process.env

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    // Missing config must not break the app — in-app notifications still work.
    return res.status(503).json({ error: 'push not configured' })
  }

  const notificationId = req.body?.notificationId
  if (notificationId == null) return res.status(400).json({ error: 'notificationId required' })

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    // Recipient and text come from the database, never from the request.
    const rows = await sb(`Notifications?ID=eq.${encodeURIComponent(notificationId)}&select=ID,UserID,Message,TaskID`)
    const note = rows?.[0]
    if (!note) return res.status(404).json({ error: 'notification not found' })

    const subs = await sb(
      `PushSubscriptions?UserID=eq.${encodeURIComponent(note.UserID)}&select=Endpoint,P256dh,Auth`
    )
    if (!subs?.length) return res.status(200).json({ sent: 0, reason: 'no devices registered' })

    const payload = JSON.stringify({
      title: 'PHILFIDA TaskFlow',
      body: note.Message,
      url: '/',
      tag: `philfida-${note.ID}`,
    })

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.Endpoint, keys: { p256dh: s.P256dh, auth: s.Auth } },
          payload
        )
      )
    )

    // 404/410 mean the browser threw the subscription away — prune it so the
    // table does not fill with dead endpoints.
    const dead = []
    results.forEach((r, i) => {
      if (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)) {
        dead.push(subs[i].Endpoint)
      }
    })
    await Promise.allSettled(
      dead.map((endpoint) =>
        sb(`PushSubscriptions?Endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
      )
    )

    return res.status(200).json({
      sent: results.filter((r) => r.status === 'fulfilled').length,
      pruned: dead.length,
    })
  } catch (err) {
    console.error('[push-send]', err)
    return res.status(500).json({ error: 'send failed' })
  }
}
