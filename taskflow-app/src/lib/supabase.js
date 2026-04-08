import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ivhghqzdhvekbdnwezwj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGdocXpkaHZla2JkbndlendqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzY4NzksImV4cCI6MjA4OTIxMjg3OX0.XLyk4yezajrr1u9sHKVvVADFMIvB7GFHX6jq-mMzHzw'

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
