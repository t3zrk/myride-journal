import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  syncMessage: string
  setSidebarOpen: (open: boolean) => void
  setSyncMessage: (message: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  syncMessage: 'Local only',
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSyncMessage: (syncMessage) => set({ syncMessage }),
}))
