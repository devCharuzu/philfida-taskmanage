import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { getData } from '../lib/api'
import { supabase } from '../lib/supabase'
import { unlockAudio, playNotifSound } from '../lib/notifSound'
import { showLocalNotification, permissionState } from '../lib/notifications'

// H1/H2 FIX: Sync only notifications using getState() so we never rely on a
// stale setGlobalData reference captured by a closure, and never use a
// functional updater (which useStore's setGlobalData doesn't support).
async function syncNotificationsOnly(sessionId) {
  if (!sessionId) return
  try {
    const { data: notifications } = await supabase
      .from('Notifications')
      .select('*')
      .eq('UserID', sessionId)
      .order('ID', { ascending: false })
      .limit(20)

    if (notifications) {
      const current = useStore.getState().globalData
      useStore.getState().setGlobalData({ ...current, notifications })
    }
  } catch (e) {
    console.error('Notification sync failed', e)
  }
}

// Realtime INSERT already carries the full row — apply it straight to the
// store instead of round-tripping to the DB again. UPDATE/DELETE (e.g. a
// notification marked read from another tab) still fall back to a refetch.
function applyNotificationInsert(row) {
  if (!row) return
  const current = useStore.getState().globalData
  if (current.notifications.some(n => String(n.ID) === String(row.ID))) return
  const notifications = [row, ...current.notifications].slice(0, 20)
  useStore.getState().setGlobalData({ ...current, notifications })
}

// Check if a comment change affects the current user and trigger a full sync if so
async function checkCommentNotification(payload, userId, syncFn) {
  try {
    const commentData = payload.new || payload.record
    if (!commentData) return

    const { data: task } = await supabase
      .from('Tasks')
      .select('EmployeeID')
      .eq('TaskID', commentData.TaskID)
      .single()

    if (!task) return

    if (String(task.EmployeeID) === String(userId)) {
      syncFn()
    } else {
      const { data: user } = await supabase
        .from('Users')
        .select('Role')
        .eq('ID', userId)
        .single()
      if (user?.Role === 'Director' || user?.Role === 'Unit Head') syncFn()
    }
  } catch (e) {
    console.error('Comment notification check failed', e)
  }
}

export function useSync() {
  // H5 FIX: depend only on the ID primitive — not the whole session object —
  // so presence-status changes don't trigger a full re-sync.
  const sessionId = useStore(s => s.session?.ID)
  const notifications = useStore(s => s.globalData.notifications)
  const channelsRef = useRef([])
  const seenUnreadIdsRef = useRef(null)

  // H1 FIX: Read store values inside the async body via getState() rather than
  // capturing them in the useCallback closure — eliminates the unstable
  // setGlobalData reference that was causing re-render loops.
  const sync = useCallback(async () => {
    const session = useStore.getState().session
    if (!session) return
    try {
      const data = await getData(session.ID, session.Region || 'Central Office')
      if (data) useStore.getState().setGlobalData(data)
      return data
    } catch (e) {
      console.error('Sync failed', e)
    }
  }, []) // intentionally no deps — always reads fresh from store

  // Single owner of "new unread notification -> sound + OS push + bell ring".
  // This hook mounts exactly once per page. NotificationBell renders twice
  // per page (desktop sidebar + mobile header, both always mounted) — letting
  // each instance independently detect "new" and play a sound doubled every
  // chime. Detecting it here instead means it only ever fires once.
  useEffect(() => {
    const unread = notifications.filter(n => n.IsRead === 'FALSE')
    const unreadIds = new Set(unread.map(n => String(n.ID)))

    if (seenUnreadIdsRef.current === null) {
      // First load — just baseline, no sound.
      seenUnreadIdsRef.current = unreadIds
      return
    }

    let newest = null
    unreadIds.forEach(id => {
      if (!seenUnreadIdsRef.current.has(id)) {
        newest = unread.find(n => String(n.ID) === id) || newest
      }
    })

    if (newest) {
      unlockAudio()
      playNotifSound()
      useStore.getState().bumpNotifyPulse()
      // Show whenever the tab is not the user's current focus — `hidden` alone
      // misses the common case of the browser being open behind another app.
      const unfocused = typeof document === 'undefined' || document.hidden || !document.hasFocus()
      if (unfocused && permissionState() === 'granted') {
        showLocalNotification('PHILFIDA TaskFlow', newest.Message)
      }
    }

    seenUnreadIdsRef.current = unreadIds
  }, [notifications])

  useEffect(() => {
    if (!sessionId) return

    const role = useStore.getState().session?.Role

    // Initial fetch
    sync()

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )
    const isSecureConnection = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const useRealtime = (isSecureConnection || isLocal) && (!isMobile || isTablet)

    if (useRealtime) {
      // Notification channel — user-scoped filter. INSERT applies the row
      // directly (no extra round-trip); UPDATE/DELETE still refetch.
      try {
        const notifCh = supabase
          .channel(`notifications-${sessionId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'Notifications', filter: `UserID=eq.${sessionId}` },
            (payload) => applyNotificationInsert(payload.new)
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'Notifications', filter: `UserID=eq.${sessionId}` },
            () => syncNotificationsOnly(sessionId)
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'Notifications', filter: `UserID=eq.${sessionId}` },
            () => syncNotificationsOnly(sessionId)
          )
          .subscribe()
        channelsRef.current.push(notifCh)
      } catch (err) {
        console.warn('Failed to create notification subscription:', err)
      }

      // Task + Comment change channels
      ;['Tasks', 'Comments'].forEach(table => {
        try {
          const ch = supabase
            .channel(`${table}-changes-${sessionId}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table },
              (payload) => {
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  const newData = payload.new || payload.record
                  if (table === 'Tasks' && String(newData.EmployeeID) === String(sessionId)) {
                    sync()
                  } else if (table === 'Comments') {
                    checkCommentNotification(payload, sessionId, sync)
                  }
                } else if (payload.eventType === 'DELETE') {
                  // An unsent message has to disappear for the other participant too.
                  // DELETE payloads only carry the primary key, so drop the row locally
                  // rather than trying to re-derive who it belonged to.
                  if (table === 'Comments') {
                    const goneId = payload.old?.ID ?? payload.old?.id
                    if (goneId == null) { sync(); return }
                    const current = useStore.getState().globalData
                    useStore.getState().setGlobalData({
                      ...current,
                      comments: current.comments.filter(c => String(c.ID) !== String(goneId)),
                    })
                  } else {
                    sync()
                  }
                }
              }
            )
            .subscribe()
          channelsRef.current.push(ch)
        } catch (err) {
          console.warn(`Failed to create ${table} subscription:`, err)
        }
      })

      // User list drives Director / Unit Head roster; poll alone can lag minutes.
      if (role === 'Director' || role === 'Unit Head') {
        try {
          const usersCh = supabase
            .channel(`users-roster-${sessionId}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'Users' },
              () => sync()
            )
            .subscribe()
          channelsRef.current.push(usersCh)
        } catch (err) {
          console.warn('Failed to create Users subscription:', err)
        }
      }
    }

    // M6 FIX: When realtime is active, poll every 2 min as a heartbeat only.
    // Without realtime (mobile phones — see isMobile above), poll every 15s;
    // that path was deliberately excluded from websockets (mobile browsers
    // suspend/kill sockets on backgrounding without signaling the app), so a
    // tighter poll is the safe way to close the "not real-time on phones" gap
    // without risking silent missed updates. Revisit if verified safe on-device.
    const pollingInterval = useRealtime ? 120000 : 15000
    const fallback = setInterval(sync, pollingInterval)

    return () => {
      channelsRef.current.forEach(ch => {
        try { supabase.removeChannel(ch) } catch {}
      })
      channelsRef.current = []
      clearInterval(fallback)
    }
  }, [sessionId, sync])

  return { sync }
}
