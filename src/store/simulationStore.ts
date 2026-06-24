import { create } from 'zustand'
import {
  SimEngine,
  DEEP_TIME_CHUNK_SIZE,
  DEEP_TIME_UI_SYNC_MS,
} from '../simulation/engine/SimEngine'
import { yearsToTicks, tickToYears } from '../simulation/engine/simTime'
import type {
  OverlayMode,
  SimulationSettings,
  SimulationSnapshot,
  Tile,
} from '../types/simulation'
import type { DeepTimeProgress, DeepTimeSummary, RuntimeState, SimSpeed } from '../types/runtime'
import { createRng, randomFloat } from '../utils/rng'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'briefing' | 'roadmap'

export type VisualMode = 'organic' | 'debug'

const DEFAULT_SETTINGS: SimulationSettings = {
  seed: 'evosphere-prime',
  worldWidth: 96,
  worldHeight: 96,
  tickRate: 1,
}

const SPEED_TICKS_PER_FRAME: Record<Exclude<SimSpeed, 'deep'>, number> = {
  1: 1,
  10: 10,
  100: 50,
  1000: 200,
}

/** UI sync interval during deep-time — full snapshot every N engine chunks. */
const DEEP_TIME_SNAPSHOT_EVERY_CHUNKS = 2

function createEngine(settings: SimulationSettings): SimEngine {
  return new SimEngine({ ...settings })
}

function randomSeed(): string {
  const rng = createRng(`seed-picker-${Date.now()}`)
  const partA = Math.floor(randomFloat(rng, 0, 1_000_000))
  const partB = Math.floor(randomFloat(rng, 0, 1_000_000))
  return `world-${partA}-${partB}`
}

function syncSnapshot(engine: SimEngine, selectedSpeciesId: string | null): SimulationSnapshot {
  return engine.getSnapshotWithSelectedSpecies(selectedSpeciesId)
}

interface SimulationStore {
  activePanel: PanelId
  phase: string
  overlayMode: OverlayMode
  visualMode: VisualMode
  selectedTile: Tile | null
  selectedSpeciesId: string | null
  settings: SimulationSettings
  snapshot: SimulationSnapshot
  engine: SimEngine
  runtime: RuntimeState
  recentActivityTiles: number[]
  deepTimeRunning: boolean
  deepTimeProgress: DeepTimeProgress | null

  setActivePanel: (panel: PanelId) => void
  setOverlayMode: (mode: OverlayMode) => void
  setVisualMode: (mode: VisualMode) => void
  selectTile: (tile: Tile | null) => void
  selectSpecies: (speciesId: string) => void
  clearSelectedSpecies: () => void
  focusSpecies: (speciesId: string) => void
  newWorldFromSeed: (seed: string) => void
  newWorldRandomSeed: () => void
  resetWorld: () => void
  stepSimulation: (count?: number) => void
  play: () => void
  pause: () => void
  setSpeed: (speed: SimSpeed) => void
  deepTimeYears: (years: number) => Promise<DeepTimeSummary>
  syncFromEngine: () => void
}

const initialEngine = createEngine(DEFAULT_SETTINGS)

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'world',
  phase: 'v0.4.1 visual biology',
  overlayMode: 'terrain',
  visualMode: 'organic',
  selectedTile: null,
  selectedSpeciesId: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: syncSnapshot(initialEngine, null),
  runtime: { isRunning: false, speed: 1 },
  recentActivityTiles: [],
  deepTimeRunning: false,
  deepTimeProgress: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  selectTile: (tile) => set({ selectedTile: tile }),

  selectSpecies: (speciesId) => {
    const { engine } = get()
    set({
      selectedSpeciesId: speciesId,
      snapshot: syncSnapshot(engine, speciesId),
    })
  },

  clearSelectedSpecies: () => {
    const { engine } = get()
    set({
      selectedSpeciesId: null,
      snapshot: syncSnapshot(engine, null),
    })
  },

  focusSpecies: (speciesId) => {
    const { engine } = get()
    set({
      selectedSpeciesId: speciesId,
      activePanel: 'species',
      snapshot: syncSnapshot(engine, speciesId),
    })
  },

  syncFromEngine: () => {
    const { engine, selectedSpeciesId } = get()
    set({
      snapshot: syncSnapshot(engine, selectedSpeciesId),
      recentActivityTiles: engine.getRecentActivityTileIndices(),
    })
  },

  newWorldFromSeed: (seed) => {
    stopRuntimeLoop()
    const trimmed = seed.trim()
    if (!trimmed) return
    const { settings } = get()
    const nextSettings = { ...settings, seed: trimmed }
    const nextEngine = createEngine(nextSettings)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot: syncSnapshot(nextEngine, null),
      selectedTile: null,
      selectedSpeciesId: null,
      runtime: { isRunning: false, speed: 1 },
      recentActivityTiles: [],
      deepTimeProgress: null,
    })
  },

  newWorldRandomSeed: () => {
    get().newWorldFromSeed(randomSeed())
  },

  resetWorld: () => {
    stopRuntimeLoop()
    const { engine, settings, selectedSpeciesId } = get()
    engine.reset({ ...settings })
    set({
      snapshot: syncSnapshot(engine, selectedSpeciesId),
      settings: engine.getSettings(),
      selectedTile: null,
      recentActivityTiles: [],
      deepTimeProgress: null,
    })
  },

  stepSimulation: (count = 1) => {
    const { engine, selectedSpeciesId } = get()
    engine.step(count)
    set({
      snapshot: syncSnapshot(engine, selectedSpeciesId),
      recentActivityTiles: engine.getRecentActivityTileIndices(),
    })
  },

  play: () => {
    const { runtime } = get()
    if (runtime.isRunning) return
    set({ runtime: { ...runtime, isRunning: true } })
    startRuntimeLoop()
  },

  pause: () => {
    stopRuntimeLoop()
    const { runtime } = get()
    set({ runtime: { ...runtime, isRunning: false } })
  },

  setSpeed: (speed) => {
    const { runtime } = get()
    set({ runtime: { ...runtime, speed } })
  },

  deepTimeYears: async (years) => {
    stopRuntimeLoop()
    const { engine, runtime, selectedSpeciesId } = get()
    const totalTicks = yearsToTicks(years)
    const startYear = tickToYears(engine.getSnapshot(false).tick)
    const targetYear = startYear + years
    const runtimeStart = performance.now()

    set({
      deepTimeRunning: true,
      deepTimeProgress: {
        completedTicks: 0,
        totalTicks,
        startYear,
        targetYear,
        elapsedMs: 0,
        mode: 'exact',
      },
      runtime: { ...runtime, isRunning: false },
    })

    const capture = engine.startDeepTimeCapture(selectedSpeciesId)
    let remaining = totalTicks
    let chunkIndex = 0

    while (remaining > 0) {
      const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
      engine.stepDeepTimeBatch(chunk)
      remaining -= chunk
      chunkIndex += 1

      const completedTicks = totalTicks - remaining
      const elapsedMs = performance.now() - runtimeStart

      if (chunkIndex % DEEP_TIME_SNAPSHOT_EVERY_CHUNKS === 0 || remaining === 0) {
        set({
          snapshot: syncSnapshot(engine, selectedSpeciesId),
          recentActivityTiles: engine.getRecentActivityTileIndices(),
          deepTimeProgress: {
            completedTicks,
            totalTicks,
            startYear,
            targetYear,
            elapsedMs,
            mode: 'exact',
          },
        })
      } else {
        set({
          deepTimeProgress: {
            completedTicks,
            totalTicks,
            startYear,
            targetYear,
            elapsedMs,
            mode: 'exact',
          },
        })
      }

      if (elapsedMs > DEEP_TIME_UI_SYNC_MS) {
        await yieldToBrowser()
      }
    }

    const summary = engine.finalizeDeepTime(capture)

    set({
      snapshot: syncSnapshot(engine, selectedSpeciesId),
      runtime: { ...runtime, isRunning: false },
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      deepTimeRunning: false,
      deepTimeProgress: null,
    })

    return summary
  },
}))

let runtimeFrameId: number | null = null

function stopRuntimeLoop(): void {
  if (runtimeFrameId !== null) {
    cancelAnimationFrame(runtimeFrameId)
    runtimeFrameId = null
  }
}

function startRuntimeLoop(): void {
  stopRuntimeLoop()

  const tick = () => {
    const state = useSimulationStore.getState()
    if (!state.runtime.isRunning) return

    const speed = state.runtime.speed
    if (speed === 'deep') {
      state.pause()
      return
    }

    const ticks = SPEED_TICKS_PER_FRAME[speed]
    state.engine.step(ticks)
    useSimulationStore.setState({
      snapshot: syncSnapshot(state.engine, state.selectedSpeciesId),
      recentActivityTiles: state.engine.getRecentActivityTileIndices(),
    })

    runtimeFrameId = requestAnimationFrame(tick)
  }

  runtimeFrameId = requestAnimationFrame(tick)
}

export { SPEED_TICKS_PER_FRAME, DEEP_TIME_SNAPSHOT_EVERY_CHUNKS }

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
