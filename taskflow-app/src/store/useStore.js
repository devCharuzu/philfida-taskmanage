import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Mobile-safe storage check
const mobileSafeStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch (error) {
      console.warn('localStorage access failed, trying sessionStorage:', error)
      try {
        return sessionStorage.getItem(name)
      } catch (sessionError) {
        console.warn('sessionStorage access failed:', sessionError)
        return null
      }
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch (error) {
      console.warn('localStorage write failed, trying sessionStorage:', error)
      try {
        sessionStorage.setItem(name, value)
      } catch (sessionError) {
        console.warn('sessionStorage write failed:', sessionError)
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch (error) {
      console.warn('localStorage remove failed, trying sessionStorage:', error)
      try {
        sessionStorage.removeItem(name)
      } catch (sessionError) {
        console.warn('sessionStorage remove failed:', sessionError)
      }
    }
  }
}

export const useStore = create(
  persist(
    (set) => ({
      session:    null,
      globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] },
      setSession:    (session) => set({ session }),
      clearSession:  ()        => set({ session: null }),
      // H2 FIX: support both plain object and functional updater (prev => newVal)
      setGlobalData: (data) => set(state => ({
        globalData: typeof data === 'function' ? data(state.globalData) : data
      })),
    }),
    {
      name: 'philfida_session',
      version: 1,
      partialize: (state) => ({ session: state.session }),
      storage: {
        getItem: mobileSafeStorage.getItem,
        setItem: (name, value) => {
          try {
            const serialized = JSON.stringify(value)
            // Check if serialized data is too large for mobile storage (reduced to 2MB for better mobile compatibility)
            if (serialized.length > 2 * 1024 * 1024) {
              console.warn('Store data too large, clearing globalData to save space')
              const compacted = { 
                session: value.session, 
                globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] } 
              }
              mobileSafeStorage.setItem(name, JSON.stringify(compacted))
            } else {
              mobileSafeStorage.setItem(name, serialized)
            }
          } catch (error) {
            console.error('Store serialization failed:', error)
            // Try to save only session data on error
            try {
              const sessionOnly = { session: value.session, globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] } }
              mobileSafeStorage.setItem(name, JSON.stringify(sessionOnly))
            } catch (fallbackError) {
              console.error('Even session-only storage failed:', fallbackError)
              // Clear storage completely as last resort
              mobileSafeStorage.removeItem(name)
            }
          }
        },
        removeItem: mobileSafeStorage.removeItem
      },
      onRehydrateStorage: () => (state) => {
        console.log('Store rehydrated on mobile:', state)
        console.log('Store session after rehydration:', state?.session)
      }
    }
  )
)