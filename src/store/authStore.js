import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase.js'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: async () => {
        await supabase.auth.signOut()
        set({ user: null })
      }
    }),
    { name: 'auth-storage' }
  )
)
