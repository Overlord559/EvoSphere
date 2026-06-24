import { create } from 'zustand'
import {
  SimEngine,
  DEEP_TIME_CHUNK_SIZE,
  DEEP_TIME_UI_SYNC_MS,
} from '../simulation/engine/SimEngine'
import { yearsToTicks, tickToYears, buildSimTimeDisplay } from '../simulation/engine/simTime'
import {
  syncAgentVisualStates,
  advanceAgentInterpolation,
} from '../ui/viewport/agentInterpolation'
import type {
  OverlayMode,
  SimulationSettings,
  SimulationSnapshot,
  Tile,
} from '../types/simulation'
import type {
  AgentVisualState,
  DeepTimeProgress,
  DeepTimeSummary,
  RuntimeState,
  SimSpeed,
} from '../types/runtime'
import { createRng, randomFloat } from '../utils/rng'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'briefing' | 'roadmap'

export type VisualMode = 'organic' | 'debug'

const DEFAULT_SETTINGS: SimulationSettings = {
  seed: 'evosphere-prime',
  worldWidth: 96,
  worldHeight: 96,
  tickRate: 1,
}

/** Internal simulation steps batched per animation frame by speed mode. */
export const SPEED_TICKS_PER_FRAME: Record<Exclude<SimSpeed, 'deep'>, number> = {
  normal: 1,
  fast: 8,
  superfast: 30,
  ultrafast: 100,
}

/** UI sync interval during deep-time — full snapshot every N engine chunks. */
export const DEEP_TIME_SNAPSHOT_EVERY_CHUNKS = 2

const INTERPOLATION_DURATION_MS = 320

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

function syncVisualStates(
  agents: SimulationSnapshot['agents']['agents'],
  prev: Map<string, AgentVisualState>,
): Map<string, AgentVisualState> {
  return syncAgentVisualStates(agents, prev)
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
  deepTimeCancelRequested: boolean
  agentVisualStates: Map<string, AgentVisualState>
  animTimeMs: number

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
  deepTimeYears: (years: number) => Promise<DeepTimeSummary | null>
  cancelDeepTime: () => void
  advanceAnimation: (deltaMs: number) => void
  syncFromEngine: () => void
}

const initialEngine = createEngine(DEFAULT_SETTINGS)
const initialSnapshot = syncSnapshot(initialEngine, null)
const initialVisualStates = syncVisualStates(initialSnapshot.agents.agents, new Map())

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'briefing',
  phase: 'v0.4.2 living simulation',
  overlayMode: 'terrain',
  visualMode: 'organic',
  selectedTile: null,
  selectedSpeciesId: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: initialSnapshot,
  runtime: { isRunning: true, speed: 'normal' },
  recentActivityTiles: [],
  deepTimeRunning: false,
  deepTimeProgress: null,
  deepTimeCancelRequested: false,
  agentVisualStates: initialVisualStates,
  animTimeMs: 0,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  selectTile: (tile) => set({ selectedTile: tile }),

  selectSpecies: (speciesId) => {
    const { engine } = get()
    const snapshot = syncSnapshot(engine, speciesId)
    set({
      selectedSpeciesId: speciesId,
      snapshot,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
    })
  },

  clearSelectedSpecies: () => {
    const { engine } = get()
    const snapshot = syncSnapshot(engine, null)
    set({
      selectedSpeciesId: null,
      snapshot,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
    })
  },

  focusSpecies: (speciesId) => {
    const { engine } = get()
    const snapshot = syncSnapshot(engine, speciesId)
    set({
      selectedSpeciesId: speciesId,
      activePanel: 'species',
      snapshot,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
    })
  },

  syncFromEngine: () => {
    const { engine, selectedSpeciesId, agentVisualStates } = get()
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      agentVisualStates: syncVisualStates(snapshot.agents.agents, agentVisualStates),
    })
  },

  newWorldFromSeed: (seed) => {
    stopRuntimeLoop()
    const trimmed = seed.trim()
    if (!trimmed) return
    const { settings } = get()
    const nextSettings = { ...settings, seed: trimmed }
    const nextEngine = createEngine(nextSettings)
    const snapshot = syncSnapshot(nextEngine, null)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot,
      selectedTile: null,
      selectedSpeciesId: null,
      runtime: { isRunning: true, speed: 'normal' },
      recentActivityTiles: [],
      deepTimeProgress: null,
      deepTimeCancelRequested: false,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
      animTimeMs: 0,
    })
    startRuntimeLoop()
  },

  newWorldRandomSeed: () => {
    get().newWorldFromSeed(randomSeed())
  },

  resetWorld: () => {
    stopRuntimeLoop()
    const { engine, settings, selectedSpeciesId } = get()
    engine.reset({ ...settings })
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      settings: engine.getSettings(),
      selectedTile: null,
      recentActivityTiles: [],
      deepTimeProgress: null,
      deepTimeCancelRequested: false,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
      runtime: { ...get().runtime, isRunning: true },
    })
    startRuntimeLoop()
  },

  stepSimulation: (count = 1) => {
    const { engine, selectedSpeciesId, agentVisualStates } = get()
    engine.step(count)
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      agentVisualStates: syncVisualStates(snapshot.agents.agents, agentVisualStates),
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

  cancelDeepTime: () => {
    set({ deepTimeCancelRequested: true })
  },

  advanceAnimation: (deltaMs) => {
    const { agentVisualStates, animTimeMs } = get()
    set({
      animTimeMs: animTimeMs + deltaMs,
      agentVisualStates: advanceAgentInterpolation(
        agentVisualStates,
        deltaMs,
        INTERPOLATION_DURATION_MS,
      ),
    })
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
      deepTimeCancelRequested: false,
      deepTimeProgress: {
        completedTicks: 0,
        totalTicks,
        startYear,
        targetYear,
        currentYear: startYear,
        elapsedMs: 0,
        mode: 'exact',
        estimatedRemainingMs: null,
      },
      runtime: { ...runtime, isRunning: false, speed: 'deep' },
    })

    const capture = engine.startDeepTimeCapture(selectedSpeciesId)
    let remaining = totalTicks
    let chunkIndex = 0

    while (remaining > 0) {
      if (get().deepTimeCancelRequested) break

      const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
      engine.stepDeepTimeBatch(chunk)
      remaining -= chunk
      chunkIndex += 1

      const completedTicks = totalTicks - remaining
      const elapsedMs = performance.now() - runtimeStart
      const currentYear = startYear + Math.floor(completedTicks / 10)
      const rate = completedTicks > 0 ? elapsedMs / completedTicks : 0
      const estimatedRemainingMs = rate > 0 ? Math.round(rate * remaining) : null

      const progress: DeepTimeProgress = {
        completedTicks,
        totalTicks,
        startYear,
        targetYear,
        currentYear,
        elapsedMs,
        mode: 'exact',
        estimatedRemainingMs,
      }

      if (chunkIndex % DEEP_TIME_SNAPSHOT_EVERY_CHUNKS === 0 || remaining === 0) {
        const snapshot = syncSnapshot(engine, selectedSpeciesId)
        set({
          snapshot,
          recentActivityTiles: engine.getRecentActivityTileIndices(),
          deepTimeProgress: progress,
          agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
        })
      } else {
        set({ deepTimeProgress: progress })
      }

      if (elapsedMs > DEEP_TIME_UI_SYNC_MS) {
        await yieldToBrowser()
      }
    }

    const cancelled = get().deepTimeCancelRequested
    const summary = cancelled ? null : engine.finalizeDeepTime(capture)
    const snapshot = syncSnapshot(engine, selectedSpeciesId)

    set({
      snapshot,
      runtime: { isRunning: true, speed: 'normal' },
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      deepTimeRunning: false,
      deepTimeProgress: null,
      deepTimeCancelRequested: false,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
    })

    startRuntimeLoop()
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
    if (!state.runtime.isRunning || state.deepTimeRunning) {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    const speed = state.runtime.speed
    if (speed === 'deep') {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    const ticks = SPEED_TICKS_PER_FRAME[speed]
    state.engine.step(ticks)
    const snapshot = syncSnapshot(state.engine, state.selectedSpeciesId)
    useSimulationStore.setState({
      snapshot,
      recentActivityTiles: state.engine.getRecentActivityTileIndices(),
      agentVisualStates: syncVisualStates(snapshot.agents.agents, state.agentVisualStates),
    })

    runtimeFrameId = requestAnimationFrame(tick)
  }

  runtimeFrameId = requestAnimationFrame(tick)
}

startRuntimeLoop()

export function getSimTimeDisplay(state: ReturnType<typeof useSimulationStore.getState>) {
  return buildSimTimeDisplay(
    state.snapshot.tick,
    state.snapshot.life,
    state.snapshot.agents,
    state.runtime.speed,
  )
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
