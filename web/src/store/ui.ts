import { create } from 'zustand'

interface UiState {
  mobileNav: boolean
  setMobileNav: (v: boolean) => void
  /** bump to force data refetches after mutations */
  version: number
  bump: () => void
}

export const useUi = create<UiState>((set) => ({
  mobileNav: false,
  setMobileNav: (mobileNav) => set({ mobileNav }),
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}))
