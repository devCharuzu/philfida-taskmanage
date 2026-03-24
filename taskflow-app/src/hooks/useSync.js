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

    // Subscribe to Supabase Realtime on all 4 tables
    const tables = ['Tasks', 'Comments', 'Notifications', 'Users']

    tables.forEach(table => {
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
        .subscribe()

      channelsRef.current.push(channel)
    })

    // Fallback poll every 30s in case realtime misses anything
    const fallback = setInterval(sync, 30000)

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
      channelsRef.current = []
      clearInterval(fallback)
    }
  }, [session, sync])

  return { sync }
}
