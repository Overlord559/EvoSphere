import { create } from 'zustand'
import { SimEngine, DEEP_TIME_CHUNK_SIZE } from '../simulation/engine/SimEngine'
import { yearsToTicks } from '../simulation/engine/simTime'
import type {
  OverlayMode,
  SimulationSettings,
  SimulationSnapshot,
  Tile,
} from '../types/simulation'
import type { DeepTimeSummary, RuntimeState, SimSpeed } from '../types/runtime'
import { createRng, randomFloat } from '../utils/rng'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'briefing' | 'roadmap'

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

function createEngine(settings: SimulationSettings): SimEngine {
  return new SimEngine({ ...settings })
}

function randomSeed(): string {
  const rng = createRng(`seed-picker-${Date.now()}`)
  const partA = Math.floor(randomFloat(rng, 0, 1_000_000))
  const partB = Math.floor(randomFloat(rng, 0, 1_000_000))
  return `world-${partA}-${partB}`
}

function syncSnapshot(engine: SimEngine): SimulationSnapshot {
  return engine.getSnapshot()
}

interface SimulationStore {
  activePanel: PanelId
  phase: string
  overlayMode: OverlayMode
  selectedTile: Tile | null
  settings: SimulationSettings
  snapshot: SimulationSnapshot
  engine: SimEngine
  runtime: RuntimeState
  recentActivityTiles: number[]
  deepTimeRunning: boolean

  setActivePanel: (panel: PanelId) => void
  setOverlayMode: (mode: OverlayMode) => void
  selectTile: (tile: Tile | null) => void
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
  phase: 'v0.3.1 runtime',
  overlayMode: 'terrain',
  selectedTile: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: syncSnapshot(initialEngine),
  runtime: { isRunning: false, speed: 1 },
  recentActivityTiles: [],
  deepTimeRunning: false,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  selectTile: (tile) => set({ selectedTile: tile }),

  syncFromEngine: () => {
    const { engine } = get()
    set({
      snapshot: syncSnapshot(engine),
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
      snapshot: syncSnapshot(nextEngine),
      selectedTile: null,
      runtime: { isRunning: false, speed: 1 },
      recentActivityTiles: [],
    })
  },

  newWorldRandomSeed: () => {
    get().newWorldFromSeed(randomSeed())
  },

  resetWorld: () => {
    stopRuntimeLoop()
    const { engine, settings } = get()
    engine.reset({ ...settings })
    set({
      snapshot: syncSnapshot(engine),
      settings: engine.getSettings(),
      selectedTile: null,
      runtime: { isRunning: false, speed: get().runtime.speed },
      recentActivityTiles: [],
    })
  },

  stepSimulation: (count = 1) => {
    const { engine } = get()
    engine.step(count)
    set({
      snapshot: syncSnapshot(engine),
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
    const { engine, runtime } = get()
    const totalTicks = yearsToTicks(years)

    set({ deepTimeRunning: true, runtime: { ...runtime, isRunning: false } })

    const capture = engine.startDeepTimeCapture()
    let remaining = totalTicks
    while (remaining > 0) {
      const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
      engine.step(chunk, true)
      remaining -= chunk
      set({
        snapshot: syncSnapshot(engine),
        recentActivityTiles: engine.getRecentActivityTileIndices(),
      })
      await yieldToBrowser()
    }

    const summary = engine.finalizeDeepTime(capture)

    set({
      snapshot: syncSnapshot(engine),
      runtime: { ...runtime, isRunning: false },
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      deepTimeRunning: false,
    })

    return summary
  },
}))

let runtimeFrameId: number | null = null
let runtimeIntervalId: ReturnType<typeof setInterval> | null = null

function stopRuntimeLoop(): void {
  if (runtimeFrameId !== null) {
    cancelAnimationFrame(runtimeFrameId)
    runtimeFrameId = null
  }
  if (runtimeIntervalId !== null) {
    clearInterval(runtimeIntervalId)
    runtimeIntervalId = null
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
      snapshot: syncSnapshot(state.engine),
      recentActivityTiles: state.engine.getRecentActivityTileIndices(),
    })

    runtimeFrameId = requestAnimationFrame(tick)
  }

  runtimeFrameId = requestAnimationFrame(tick)
}

export { SPEED_TICKS_PER_FRAME }

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
