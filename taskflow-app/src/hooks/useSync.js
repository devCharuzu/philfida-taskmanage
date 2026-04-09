import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { getData } from '../lib/api'
import { supabase } from '../lib/supabase'

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
      // Subscribe to Supabase Realtime on all 4 tables
      const tables = ['Tasks', 'Comments', 'Notifications', 'Users']

      tables.forEach(table => {
        try {
          const channel = supabase
            .channel(`realtime-${table}-${session.ID}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table },
              () => {
                // Any change to any of these tables triggers a full re-fetch
                sync()
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.log(`Realtime subscription active for ${table}`)
              } else if (status === 'CHANNEL_ERROR') {
                console.warn(`Realtime subscription failed for ${table}, falling back to polling`)
              }
            })

          channelsRef.current.push(channel)
        } catch (error) {
          console.warn(`Failed to create realtime subscription for ${table}:`, error)
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
