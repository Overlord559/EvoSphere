import { create } from 'zustand'
import { SimEngine } from '../simulation/engine/SimEngine'
import type {
  OverlayMode,
  SimulationSettings,
  SimulationSnapshot,
  Tile,
} from '../types/simulation'
import { createRng, randomFloat } from '../utils/rng'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'roadmap'

const DEFAULT_SETTINGS: SimulationSettings = {
  seed: 'evosphere-prime',
  worldWidth: 96,
  worldHeight: 96,
  tickRate: 1,
}

function createEngine(settings: SimulationSettings): SimEngine {
  return new SimEngine({ ...settings })
}

function randomSeed(): string {
  const rng = createRng(`seed-picker-${Date.now()}`)
  const partA = Math.floor(randomFloat(rng, 0, 1_000_000))
  const partB = Math.floor(randomFloat(rng, 0, 1_000_000))
  return `world-${partA}-${partB}`
}

interface SimulationStore {
  activePanel: PanelId
  phase: string
  overlayMode: OverlayMode
  selectedTile: Tile | null
  settings: SimulationSettings
  snapshot: SimulationSnapshot
  engine: SimEngine

  setActivePanel: (panel: PanelId) => void
  setOverlayMode: (mode: OverlayMode) => void
  selectTile: (tile: Tile | null) => void
  newWorldFromSeed: (seed: string) => void
  newWorldRandomSeed: () => void
  resetWorld: () => void
  stepSimulation: () => void
}

function syncSnapshot(engine: SimEngine): SimulationSnapshot {
  return engine.getSnapshot()
}

const initialEngine = createEngine(DEFAULT_SETTINGS)

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'world',
  phase: 'v0.2 world + viewport',
  overlayMode: 'terrain',
  selectedTile: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: syncSnapshot(initialEngine),

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  selectTile: (tile) => set({ selectedTile: tile }),

  newWorldFromSeed: (seed) => {
    const trimmed = seed.trim()
    if (!trimmed) return
    const { settings } = get()
    const nextSettings = { ...settings, seed: trimmed }
    const nextEngine = createEngine(nextSettings)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot: syncSnapshot(nextEngine),
      selectedTile: null,
    })
  },

  newWorldRandomSeed: () => {
    get().newWorldFromSeed(randomSeed())
  },

  resetWorld: () => {
    const { engine, settings } = get()
    engine.reset({ ...settings })
    set({
      snapshot: syncSnapshot(engine),
      settings: engine.getSettings(),
      selectedTile: null,
    })
  },

  stepSimulation: () => {
    const { engine } = get()
    engine.step()
    set({ snapshot: syncSnapshot(engine) })
  },
}))
