import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

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

const emptyGlobalData = () => ({ tasks: [], users: [], comments: [], notifications: [], history: [], availabilitySchedules: [] })

const persistStorage = createJSONStorage(() => mobileSafeStorage)

export const useStore = create(
  persist(
    (set) => ({
      session: null,
      globalData: emptyGlobalData(),
      // Bumped once, in one place (useSync), whenever a genuinely new unread
      // notification arrives — NotificationBell watches this to trigger its
      // ring animation instead of re-detecting "new" itself.
      notifyPulse: 0,
      bumpNotifyPulse: () => set((state) => ({ notifyPulse: state.notifyPulse + 1 })),
      setSession: (session) => set(state => ({
        session,
        ...(state.session?.ID !== session?.ID ? { globalData: emptyGlobalData() } : {}),
      })),
      clearSession: () => set({ session: null, globalData: emptyGlobalData() }),
      setGlobalData: (data) => set((state) => ({
        globalData: typeof data === 'function' ? data(state.globalData) : data
      })),
      updateSession: (updates) => set((state) => ({
        session: state.session ? { ...state.session, ...updates } : null
      })),
    }),
    {
      name: 'philfida_session',
      version: 2,
      partialize: (state) => ({ session: state.session }),
      storage: persistStorage,
    }
  )
)
