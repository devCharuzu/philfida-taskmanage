import { createClient } from '@supabase/supabase-js'

// Environment variables with validation
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Enhanced environment validation
const validateEnvironment = () => {
  const errors = []
  
  if (!SUPABASE_URL) {
    errors.push('VITE_SUPABASE_URL is missing')
  } else if (!SUPABASE_URL.startsWith('https://')) {
    errors.push('VITE_SUPABASE_URL must be a valid HTTPS URL')
  }
  
  if (!SUPABASE_ANON_KEY) {
    errors.push('VITE_SUPABASE_ANON_KEY is missing')
  } else if (SUPABASE_ANON_KEY.length < 20) {
    errors.push('VITE_SUPABASE_ANON_KEY appears to be invalid (too short)')
  }
  
  return errors
}

// Debug logging utility
const debugLog = (message, data = null) => {
  if (import.meta.env.DEV) {
    console.log(`[Supabase Debug] ${message}`, data || '')
  }
}

// Environment validation with detailed error reporting
debugLog('Checking environment variables...')
const envErrors = validateEnvironment()

let supabaseClient
let utils

if (envErrors.length > 0) {
  const errorMessage = `Supabase configuration error:\n${envErrors.join('\n')}\n\nPlease check your environment variables:\n- For development: .env.local file\n- For production: .env file or deployment platform environment variables`
  console.error(errorMessage)
  
  // In production, don't throw immediately - try to continue with a warning
  if (import.meta.env.PROD) {
    console.warn('Production deployment detected - environment variables may need to be configured in your hosting platform')
    // Create a minimal client that will fail gracefully when used
    supabaseClient = createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: false },
    })
    utils = {
      isAuthenticated: () => Promise.resolve(false),
      getCurrentUser: () => Promise.resolve(null),
      signOut: () => Promise.resolve(false),
    }
  } else {
    throw new Error(errorMessage)
  }
} else {
  debugLog('Environment variables validated successfully')
  debugLog('Supabase URL:', SUPABASE_URL.substring(0, 20) + '...')
  debugLog('Anon Key format:', SUPABASE_ANON_KEY.substring(0, 10) + '...')

  // Supabase client configuration
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

  // Create Supabase client
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig)

  // Test connection and handle legacy API key issues
  const testConnection = async () => {
    try {
      const { error } = await supabaseClient.from('Users').select('count').limit(1)
      if (error) {
        if (error.message?.includes('Legacy API keys are disabled')) {
          console.error(`
CRITICAL: Supabase Legacy API Keys Disabled
-------------------------------------------
Your Supabase project has disabled legacy API keys. To fix this:

OPTION 1: Re-enable Legacy Keys (Quick Fix)
1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ivhghqzdhvekbdnwezwj
2. Navigate to Settings > API
3. Scroll down to "Legacy API Keys" section
4. Click "Re-enable legacy API keys"

OPTION 2: Update to New Keys (Recommended)
1. In Supabase Dashboard > Settings > API
2. Find the "New API Keys" section
3. Copy the new "Publishable" key
4. Update your .env.local file:
   VITE_SUPABASE_ANON_KEY=your_new_publishable_key

The application will not function until this is resolved.
          `)
        }
        throw error
      }
    } catch (error) {
      debugLog('Connection test failed:', error)
      throw error
    }
  }

  // Run connection test in development
  if (import.meta.env.DEV) {
    testConnection().catch(() => {
      // Don't throw in development, just log the error
      console.warn('Supabase connection test failed - check the error message above for resolution steps')
    })
  }

  // Utility functions for common operations
  utils = {
    // Check if user is authenticated
    isAuthenticated: async () => {
      try {
        const { data: { session }, error } = await supabaseClient.auth.getSession()
        if (error) throw error
        return !!session
      } catch (error) {
        debugLog('Authentication check failed:', error)
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
        debugLog('Get current user failed:', error)
        return null
      }
    },

    // Sign out
    signOut: async () => {
      try {
        const { error } = await supabaseClient.auth.signOut()
        if (error) throw error
        debugLog('User signed out successfully')
        return true
      } catch (error) {
        debugLog('Sign out failed:', error)
        return false
      }
    },
  }

  debugLog('Supabase client initialized successfully')
}

// Export the client and utilities
export const supabase = supabaseClient
export const supabaseUtils = utils

// Export for easy access in components
export default supabase
