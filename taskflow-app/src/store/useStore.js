import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    }
  )
)