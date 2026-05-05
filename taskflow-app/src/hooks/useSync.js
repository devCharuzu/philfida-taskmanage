import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { getData } from '../lib/api'
import { supabase } from '../lib/supabase'

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
  const channelsRef = useRef([])

  // H1 FIX: Read store values inside the async body via getState() rather than
  // capturing them in the useCallback closure — eliminates the unstable
  // setGlobalData reference that was causing re-render loops.
  const sync = useCallback(async () => {
    const session = useStore.getState().session
    if (!session) return
    try {
      const data = await getData(session.ID)
      if (data) useStore.getState().setGlobalData(data)
      return data
    } catch (e) {
      console.error('Sync failed', e)
    }
  }, []) // intentionally no deps — always reads fresh from store

  useEffect(() => {
    if (!sessionId) return

    // Initial fetch
    sync()

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )
    const isSecureConnection =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )

    const useRealtime = isSecureConnection && (!isMobile || isTablet)

    if (useRealtime) {
      // Notification channel — user-scoped filter
      try {
        const notifCh = supabase
          .channel(`notifications-${sessionId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'Notifications', filter: `UserID=eq.${sessionId}` },
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
                }
              }
            )
            .subscribe()
          channelsRef.current.push(ch)
        } catch (err) {
          console.warn(`Failed to create ${table} subscription:`, err)
        }
      })
    }

    // M6 FIX: When realtime is active, poll every 2 min as a heartbeat only.
    // Without realtime (mobile/insecure), poll every 60 s.
    const pollingInterval = useRealtime ? 120000 : 60000
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
