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
      setGlobalData: (data)    => set({ globalData: data }),
    }),
    {
      name:       'philfida_session',
      partialize: (state) => ({ session: state.session }),
      storage: mobileSafeStorage,
      onRehydrateStorage: () => (state) => {
        console.log('Store rehydrated on mobile:', state)
      },
      serialize: (state) => {
        try {
          return JSON.stringify(state)
        } catch (error) {
          console.error('Store serialization failed:', error)
          return JSON.stringify({ session: null, globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] } })
        }
      },
      deserialize: (str) => {
        try {
          return JSON.parse(str)
        } catch (error) {
          console.error('Store deserialization failed:', error)
          return { session: null, globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] } }
        }
      }
    }
  )
)