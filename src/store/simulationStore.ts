import { create } from 'zustand'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'roadmap'

interface SimulationStore {
  activePanel: PanelId
  phase: string
  setActivePanel: (panel: PanelId) => void
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  activePanel: 'world',
  phase: 'v0.1 foundation',
  setActivePanel: (panel) => set({ activePanel: panel }),
}))
