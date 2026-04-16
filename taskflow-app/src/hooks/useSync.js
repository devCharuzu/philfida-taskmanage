import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { getData } from '../lib/api'
import { supabase } from '../lib/supabase'

// Helper function to sync only notifications
async function syncNotificationsOnly(session, setGlobalData) {
  if (!session) return
  try {
    const { data: notifications } = await supabase
      .from('Notifications')
      .select('*')
      .eq('UserID', session.ID)
      .order('ID', { ascending: false })
      .limit(20)
    
    if (notifications) {
      setGlobalData(prev => ({
        ...prev,
        notifications: notifications
      }))
    }
  } catch (e) {
    console.error('Notification sync failed', e)
  }
}

// Helper function to check if comment change affects current user
async function checkCommentNotification(payload, userId, sync) {
  try {
    const commentData = payload.new || payload.record
    if (!commentData) return
    
    // Get task details to check if user is involved
    const { data: task } = await supabase
      .from('Tasks')
      .select('*')
      .eq('TaskID', commentData.TaskID)
      .single()
    
    if (!task) return
    
    // If user is the employee or a director, sync
    if (task.EmployeeID === userId) {
      sync()
    } else {
      // Check if user is a director
      const { data: user } = await supabase
        .from('Users')
        .select('Role')
        .eq('ID', userId)
        .single()
      
      if (user?.Role === 'Director') {
        sync()
      }
    }
  } catch (e) {
    console.error('Comment notification check failed', e)
  }
}

export function useSync() {
  const session = useStore(s => s.session)
  const setGlobalData = useStore(s => s.setGlobalData)
  const channelsRef = useRef([])

  const sync = useCallback(async () => {
    if (!session) return
    try {
      const data = await getData(session.ID)
      setGlobalData(data)
      return data
    } catch (e) {
      console.error('Sync failed', e)
    }
  }, [session, setGlobalData])

  useEffect(() => {
    if (!session) return

    // Initial fetch
    sync()

    // Check if we should use realtime or fallback to polling only
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
    const isSecureConnection = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const useRealtime = isSecureConnection && !isMobile

    if (useRealtime) {
      console.log('Using realtime subscriptions')
      
      // Targeted notification subscription - only for user-specific notifications
      try {
        const notificationChannel = supabase
          .channel(`notifications-${session.ID}`)
          .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public', 
              table: 'Notifications',
              filter: `UserID=eq.${session.ID}`
            },
            (payload) => {
              console.log('New notification received:', payload)
              // Only sync notifications, not entire data
              syncNotificationsOnly(session, setGlobalData)
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Realtime notification subscription active')
            } else if (status === 'CHANNEL_ERROR') {
              console.warn('Realtime notification subscription failed, falling back to polling')
            }
          })

        channelsRef.current.push(notificationChannel)
      } catch (error) {
        console.warn('Failed to create notification subscription:', error)
      }

      // Subscribe to task and comment changes that might affect notifications
      const criticalTables = ['Tasks', 'Comments']
      criticalTables.forEach(table => {
        try {
          const channel = supabase
            .channel(`${table}-changes-${session.ID}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table },
              (payload) => {
                // Check if this change affects the current user
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  const newData = payload.new || payload.record
                  if (table === 'Tasks' && newData.EmployeeID === session.ID) {
                    // Task assigned to this user changed
                    sync()
                  } else if (table === 'Comments') {
                    // Comment change - check if user is involved
                    checkCommentNotification(payload, session.ID, sync)
                  }
                }
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.log(`Realtime ${table} subscription active`)
              }
            })

          channelsRef.current.push(channel)
        } catch (error) {
          console.warn(`Failed to create ${table} subscription:`, error)
        }
      })
    } else {
      console.log('Using polling-only mode (mobile or insecure connection detected)')
    }

    // Fallback poll every 30s (primary for mobile, backup for desktop)
    const fallback = setInterval(sync, 30000)

    return () => {
      channelsRef.current.forEach(ch => {
        try {
          supabase.removeChannel(ch)
        } catch (error) {
          console.warn('Error removing channel:', error)
        }
      })
      channelsRef.current = []
      clearInterval(fallback)
    }
  }, [session, sync])

  return { sync }
}
