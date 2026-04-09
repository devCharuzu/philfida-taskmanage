import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug logging
if (import.meta.env.DEV) {
  console.log('Environment variables check:')
  console.log('VITE_SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING')
  console.log('VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'SET' : 'MISSING')
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables! Check your .env.local file.')
}

if (import.meta.env.DEV) {
  console.log('✅ 🔐 Supabase initialized from environment variables')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Enable automatic session detection from the URL so PKCE callbacks
    // are handled by Supabase instead of manual exchange logic.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
