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

if (envErrors.length > 0) {
  const errorMessage = `Supabase configuration error:\n${envErrors.join('\n')}\n\nPlease check your .env.local file and ensure all required environment variables are set.`
  console.error(errorMessage)
  throw new Error(errorMessage)
}

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

// Create and export Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig)

// Utility functions for common operations
export const supabaseUtils = {
  // Check if user is authenticated
  isAuthenticated: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
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
      const { data: { user }, error } = await supabase.auth.getUser()
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
      const { error } = await supabase.auth.signOut()
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

// Export for easy access in components
export default supabase
