import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Director sessions use sessionStorage (no auto-login across browser sessions).
// Regular users use localStorage (persistent login).
const ADMIN_STORAGE_KEY = 'philfida_admin_session'
const USER_STORAGE_KEY = 'philfida_session'

const mobileSafeStorage = {
  getItem: (name) => {
    try {
      // Check sessionStorage first for admin sessions
      const adminData = sessionStorage.getItem(ADMIN_STORAGE_KEY)
      if (adminData) return adminData
      return localStorage.getItem(name)
    } catch (error) {
      console.warn('Storage access failed:', error)
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
      // Parse the value to check if the session is a Director
      let parsed = null
      try { parsed = JSON.parse(value) } catch { /* ignore */ }
      const isDirector = parsed?.state?.session?.Role === 'Director'

      if (isDirector) {
        // Director: store in sessionStorage only (no auto-login)
        sessionStorage.setItem(ADMIN_STORAGE_KEY, value)
        // Remove any existing localStorage session to prevent auto-login
        localStorage.removeItem(name)
      } else {
        // Regular user: store in localStorage (persistent)
        localStorage.setItem(name, value)
        // Clean up any admin session
        sessionStorage.removeItem(ADMIN_STORAGE_KEY)
      }
    } catch (error) {
      console.warn('Storage write failed:', error)
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
      sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    } catch (error) {
      console.warn('Storage remove failed:', error)
    }
  }
}

const persistStorage = createJSONStorage(() => mobileSafeStorage)

export const useStore = create(
  persist(
    (set) => ({
      session: null,
      globalData: { tasks: [], users: [], comments: [], notifications: [], history: [] },
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
      setGlobalData: (data) => set((state) => ({
        globalData: typeof data === 'function' ? data(state.globalData) : data
      })),
      updateSession: (updates) => set((state) => ({
        session: state.session ? { ...state.session, ...updates } : null
      })),
    }),
    {
      name: USER_STORAGE_KEY,
      version: 2,
      partialize: (state) => ({ session: state.session }),
      storage: persistStorage,
      onRehydrateStorage: () => (state) => {
        console.log('Store rehydrated:', state)
      }
    }
  )
)