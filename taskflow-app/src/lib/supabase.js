import { createClient } from '@supabase/supabase-js'

// Environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Debug logging utility (only in development)
const debugLog = (message, data = null) => {
  if (import.meta.env.DEV) {
    console.log(`[Supabase] ${message}`, data || '')
  }
}

// Environment validation
const validateEnvironment = () => {
  const errors = []

  if (!SUPABASE_URL) {
    errors.push('VITE_SUPABASE_URL is missing')
  } else if (!SUPABASE_URL.startsWith('https://')) {
    errors.push('VITE_SUPABASE_URL must be a valid HTTPS URL')
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing')
  } else if (!SUPABASE_PUBLISHABLE_KEY.startsWith('sb_')) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY appears invalid (should start with sb_)')
  } else if (SUPABASE_PUBLISHABLE_KEY.length < 30) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY appears incomplete (too short)')
  }

  return errors
}

// Supabase client config
const supabaseConfig = {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    debug: import.meta.env.DEV,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'taskflow-app/1.0.0',
    },
  },
  db: {
    schema: 'public',
  },
}

// Validate environment
const envErrors = validateEnvironment()

let supabaseClient
let utils

if (envErrors.length > 0) {
  const errorMessage = [
    'Supabase configuration error:',
    ...envErrors,
    '',
    'Please set the following in your .env.local file:',
    '  VITE_SUPABASE_URL=https://your-project-id.supabase.co',
    '  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...',
    '',
    'Get these values from: Supabase Dashboard → Settings → API',
    'Then restart your dev server: npm run dev',
  ].join('\n')

  console.error(errorMessage)

  if (import.meta.env.PROD) {
    console.warn('Running in production with missing env vars — app will not function correctly.')
    supabaseClient = createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: false },
    })
  } else {
    throw new Error(errorMessage)
  }

  utils = {
    isAuthenticated: () => Promise.resolve(false),
    getCurrentUser: () => Promise.resolve(null),
    signOut: () => Promise.resolve(false),
  }
} else {
  debugLog('Environment validated ✓')
  debugLog('URL:', SUPABASE_URL.substring(0, 30) + '...')
  debugLog('Key:', SUPABASE_PUBLISHABLE_KEY.substring(0, 10) + '...')

  // Create the Supabase client
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseConfig)

  // Test connection in development only
  if (import.meta.env.DEV) {
    supabaseClient
      .from('Users')
      .select('count')
      .limit(1)
      .then(({ error }) => {
        if (error) {
          console.error('[Supabase] Connection test failed:', error.message)
          if (error.message?.includes('Legacy API keys are disabled')) {
            console.error(
              '[Supabase] Legacy API keys are disabled.\n' +
              'Go to Supabase Dashboard → Settings → API → get the new Publishable key\n' +
              'and update VITE_SUPABASE_PUBLISHABLE_KEY in your .env.local'
            )
          }
        } else {
          debugLog('Connection test passed ✓')
        }
      })
  }

  // Utility functions
  utils = {
    // Check if user is authenticated
    isAuthenticated: async () => {
      try {
        const { data: { session }, error } = await supabaseClient.auth.getSession()
        if (error) throw error
        return !!session
      } catch (error) {
        debugLog('isAuthenticated failed:', error)
        return false
      }
    },

    // Get current user
    getCurrentUser: async () => {
      try {
        const { data: { user }, error } = await supabaseClient.auth.getUser()
        if (error) throw error
        return user
      } catch (error) {
        debugLog('getCurrentUser failed:', error)
        return null
      }
    },

    // Sign out
    signOut: async () => {
      try {
        const { error } = await supabaseClient.auth.signOut()
        if (error) throw error
        debugLog('Signed out ✓')
        return true
      } catch (error) {
        debugLog('signOut failed:', error)
        return false
      }
    },
  }

  debugLog('Supabase client ready ✓')
}

export const supabase = supabaseClient
export const supabaseUtils = utils
export default supabase