import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'COACH' | 'CLIENT'
  title: string | null
  avatarColor: string
  timezone: string
  clientId: string | null
}

interface AuthState {
  token: string | null
  user: SessionUser | null
  ai: { mode: string; model: string } | null
  setSession: (token: string, user: SessionUser) => void
  setUser: (user: SessionUser) => void
  setAi: (ai: { mode: string; model: string }) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      ai: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      setAi: (ai) => set({ ai }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'executiveos-auth' },
  ),
)
