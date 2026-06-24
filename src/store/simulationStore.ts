import { create } from 'zustand'
import {
  SimEngine,
  DEEP_TIME_CHUNK_SIZE,
  DEEP_TIME_UI_SYNC_MS,
} from '../simulation/engine/SimEngine'
import {
  shouldRefreshSnapshot,
  SPEED_SCHEDULE,
  SIM_MS_BUDGET_PER_FRAME,
  ticksForBudget,
} from '../simulation/engine/simScheduler'
import { yearsToTicks, tickToYears, buildSimTimeDisplay } from '../simulation/engine/simTime'
import {
  DEFAULT_WORLD_SIZE_PRESET,
  dimensionsForPreset,
  settingsWithPreset,
} from '../simulation/world/worldSizePresets'
import {
  syncAgentVisualStates,
  advanceAgentInterpolation,
} from '../ui/viewport/agentInterpolation'
import type {
  OverlayMode,
  SimulationSettings,
  SimulationSnapshot,
  Tile,
  WorldSizePreset,
} from '../types/simulation'
import type {
  AgentVisualState,
  CameraFocusRequest,
  DeepTimeProgress,
  DeepTimeSummary,
  PerformanceStats,
  RuntimeState,
  SimSpeed,
  ThrottleStatus,
} from '../types/runtime'
import { createRng, randomFloat } from '../utils/rng'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'briefing' | 'roadmap'

export type VisualMode = 'organic' | 'debug'

const DEFAULT_DIMS = dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET)

const DEFAULT_SETTINGS: SimulationSettings = {
  seed: 'evosphere-prime',
  worldWidth: DEFAULT_DIMS.width,
  worldHeight: DEFAULT_DIMS.height,
  tickRate: 1,
  worldSizePreset: DEFAULT_WORLD_SIZE_PRESET,
}

export const DEEP_TIME_SNAPSHOT_EVERY_CHUNKS = 2
const INTERPOLATION_DURATION_MS = 320

const DEFAULT_PERFORMANCE: PerformanceStats = {
  fpsEstimate: 60,
  simMsPerFrame: 0,
  lastFrameSimMs: 0,
  drawnTiles: 0,
  drawnAgents: 0,
  drawnPlantTiles: 0,
  lodLevel: 'medium',
}

function createDefaultRuntime(): RuntimeState {
  return {
    isRunning: true,
    speed: 'normal',
    throttleStatus: 'ok',
    throttleMessage: null,
    pauseWhileInspecting: false,
    followSelectedSpecies: false,
    performance: { ...DEFAULT_PERFORMANCE },
    internalTick: 0,
    lastSnapshotTick: 0,
    simulatedYear: 0,
  }
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

function syncSnapshot(
  engine: SimEngine,
  selectedSpeciesId: string | null,
  fullBriefing = true,
  includeEntities = true,
): SimulationSnapshot {
  return engine.getSnapshotWithSelectedSpecies(selectedSpeciesId, {
    fullBriefing,
    includeOrganisms: includeEntities,
    includeAgents: includeEntities,
  })
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
  cameraFocusRequest: CameraFocusRequest | null
  cameraFocusSeq: number

  setActivePanel: (panel: PanelId) => void
  setOverlayMode: (mode: OverlayMode) => void
  setVisualMode: (mode: VisualMode) => void
  selectTile: (tile: Tile | null) => void
  selectSpecies: (speciesId: string) => void
  clearSelectedSpecies: () => void
  focusSpecies: (speciesId: string) => void
  focusTile: (x: number, y: number, zoom?: number) => void
  setWorldSizePreset: (preset: WorldSizePreset) => void
  setPauseWhileInspecting: (value: boolean) => void
  setFollowSelectedSpecies: (value: boolean) => void
  updatePerformanceStats: (partial: Partial<PerformanceStats>) => void
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
  clearCameraFocusRequest: () => void
}

const initialEngine = createEngine(DEFAULT_SETTINGS)
const initialSnapshot = syncSnapshot(initialEngine, null)
const initialVisualStates = syncVisualStates(initialSnapshot.agents.agents, new Map())

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'briefing',
  phase: 'v0.5 body plans + senses + selection',
  overlayMode: 'terrain',
  visualMode: 'organic',
  selectedTile: null,
  selectedSpeciesId: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: initialSnapshot,
  runtime: {
    ...createDefaultRuntime(),
    internalTick: initialSnapshot.tick,
    lastSnapshotTick: initialSnapshot.lastSnapshotTick,
    simulatedYear: tickToYears(initialSnapshot.tick),
  },
  recentActivityTiles: [],
  deepTimeRunning: false,
  deepTimeProgress: null,
  deepTimeCancelRequested: false,
  agentVisualStates: initialVisualStates,
  animTimeMs: 0,
  cameraFocusRequest: null,
  cameraFocusSeq: 0,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setVisualMode: (mode) => set({ visualMode: mode }),

  selectTile: (tile) => {
    set({ selectedTile: tile, activePanel: tile ? 'inspector' : get().activePanel })
  },

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
    const { engine, snapshot } = get()
    const occ = snapshot.life.speciesOccupancy[speciesId]
    const nextSnapshot = syncSnapshot(engine, speciesId)
    const updates: Partial<SimulationStore> = {
      selectedSpeciesId: speciesId,
      activePanel: 'species',
      snapshot: nextSnapshot,
      agentVisualStates: syncVisualStates(nextSnapshot.agents.agents, get().agentVisualStates),
    }

    if (occ && occ.tileIndices.length > 0) {
      const idx = occ.tileIndices[Math.floor(occ.tileIndices.length / 2)]
      const x = idx % snapshot.world.width
      const y = Math.floor(idx / snapshot.world.width)
      updates.cameraFocusRequest = { tileX: x, tileY: y, zoom: 3, id: get().cameraFocusSeq + 1 }
      updates.cameraFocusSeq = get().cameraFocusSeq + 1
    }

    set(updates)
  },

  focusTile: (x, y, zoom = 3) => {
    set({
      cameraFocusRequest: { tileX: x, tileY: y, zoom, id: get().cameraFocusSeq + 1 },
      cameraFocusSeq: get().cameraFocusSeq + 1,
    })
  },

  setWorldSizePreset: (preset) => {
    stopRuntimeLoop()
    const { settings } = get()
    const nextSettings = settingsWithPreset(settings, preset)
    const nextEngine = createEngine(nextSettings)
    const snapshot = syncSnapshot(nextEngine, null)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot,
      selectedTile: null,
      selectedSpeciesId: null,
      recentActivityTiles: [],
      deepTimeProgress: null,
      deepTimeCancelRequested: false,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
      animTimeMs: 0,
      runtime: { ...createDefaultRuntime(), internalTick: snapshot.tick, lastSnapshotTick: snapshot.lastSnapshotTick, simulatedYear: tickToYears(snapshot.tick) },
    })
    startRuntimeLoop()
  },

  setPauseWhileInspecting: (value) =>
    set({ runtime: { ...get().runtime, pauseWhileInspecting: value } }),

  setFollowSelectedSpecies: (value) =>
    set({ runtime: { ...get().runtime, followSelectedSpecies: value } }),

  updatePerformanceStats: (partial) =>
    set({
      runtime: {
        ...get().runtime,
        performance: { ...get().runtime.performance, ...partial },
      },
    }),

  clearCameraFocusRequest: () => set({ cameraFocusRequest: null }),

  syncFromEngine: () => {
    const { engine, selectedSpeciesId, agentVisualStates } = get()
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      agentVisualStates: syncVisualStates(snapshot.agents.agents, agentVisualStates),
      runtime: {
        ...get().runtime,
        internalTick: engine.getInternalTick(),
        lastSnapshotTick: engine.getLastSnapshotTick(),
        simulatedYear: tickToYears(engine.getInternalTick()),
        throttleMessage: engine.getStabilityWarning(),
      },
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
      runtime: { ...createDefaultRuntime(), internalTick: snapshot.tick, lastSnapshotTick: snapshot.lastSnapshotTick, simulatedYear: tickToYears(snapshot.tick) },
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
      runtime: { ...get().runtime, isRunning: true, internalTick: snapshot.tick, lastSnapshotTick: snapshot.lastSnapshotTick, simulatedYear: tickToYears(snapshot.tick) },
    })
    startRuntimeLoop()
  },

  stepSimulation: (count = 1) => {
    const { engine, selectedSpeciesId, agentVisualStates } = get()
    engine.step(count, false, 'normal')
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      recentActivityTiles: engine.getRecentActivityTileIndices(),
      agentVisualStates: syncVisualStates(snapshot.agents.agents, agentVisualStates),
      runtime: {
        ...get().runtime,
        internalTick: engine.getInternalTick(),
        lastSnapshotTick: engine.getLastSnapshotTick(),
        simulatedYear: tickToYears(engine.getInternalTick()),
        throttleMessage: engine.getStabilityWarning(),
      },
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
          runtime: {
            ...get().runtime,
            internalTick: engine.getInternalTick(),
            lastSnapshotTick: engine.getLastSnapshotTick(),
            simulatedYear: tickToYears(engine.getInternalTick()),
          },
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
      runtime: { ...createDefaultRuntime(), internalTick: snapshot.tick, lastSnapshotTick: snapshot.lastSnapshotTick, simulatedYear: tickToYears(snapshot.tick) },
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
let lastSnapshotMs = 0
let avgMsPerTick = 1.2
let lastFpsSampleMs = performance.now()
let framesSinceFpsSample = 0

function stopRuntimeLoop(): void {
  if (runtimeFrameId !== null) {
    cancelAnimationFrame(runtimeFrameId)
    runtimeFrameId = null
  }
}

function deriveThrottleStatus(
  simMs: number,
  ticksAttempted: number,
  ticksRun: number,
  stabilityWarning: string | null,
): { status: ThrottleStatus; message: string | null } {
  if (stabilityWarning) {
    return { status: 'overloaded', message: stabilityWarning }
  }
  if (simMs > SIM_MS_BUDGET_PER_FRAME * 2) {
    return { status: 'throttled', message: 'Simulation throttled — reducing steps per frame' }
  }
  if (ticksRun < ticksAttempted) {
    return { status: 'catching_up', message: 'Simulation catching up — time budget active' }
  }
  return { status: 'ok', message: null }
}

function startRuntimeLoop(): void {
  stopRuntimeLoop()
  lastSnapshotMs = performance.now()

  const tick = () => {
    const frameStart = performance.now()
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

    if (state.runtime.pauseWhileInspecting && state.selectedTile) {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    const schedule = SPEED_SCHEDULE[speed]
    const ticksAttempted = ticksForBudget(schedule, state.runtime.performance.lastFrameSimMs, avgMsPerTick)
    const simMs = state.engine.step(ticksAttempted, false, speed)
    if (ticksAttempted > 0) {
      avgMsPerTick = avgMsPerTick * 0.85 + (simMs / ticksAttempted) * 0.15
    }

    const internalTick = state.engine.getInternalTick()
    const msSinceSnapshot = frameStart - lastSnapshotMs
    const needSnapshot = shouldRefreshSnapshot(
      schedule,
      internalTick,
      state.runtime.lastSnapshotTick,
      msSinceSnapshot,
    )

    const stabilityWarning = state.engine.getStabilityWarning()
    const throttle = deriveThrottleStatus(simMs, ticksAttempted, ticksAttempted, stabilityWarning)

    if (needSnapshot) {
      const fullBriefing = schedule.fullBriefingEverySnapshot
      const includeEntities = speed === 'normal' || speed === 'fast' || needSnapshot
      const snapshot = syncSnapshot(
        state.engine,
        state.selectedSpeciesId,
        fullBriefing,
        includeEntities,
      )
      lastSnapshotMs = frameStart

      useSimulationStore.setState({
        snapshot,
        recentActivityTiles: state.engine.getRecentActivityTileIndices(),
        agentVisualStates: syncVisualStates(snapshot.agents.agents, state.agentVisualStates),
        runtime: {
          ...state.runtime,
          internalTick,
          lastSnapshotTick: state.engine.getLastSnapshotTick(),
          simulatedYear: tickToYears(internalTick),
          throttleStatus: throttle.status,
          throttleMessage: throttle.message,
          performance: {
            ...state.runtime.performance,
            simMsPerFrame: simMs,
            lastFrameSimMs: simMs,
          },
        },
      })

      if (state.runtime.followSelectedSpecies && state.selectedSpeciesId) {
        const occ = snapshot.life.speciesOccupancy[state.selectedSpeciesId]
        if (occ && occ.tileIndices.length > 0) {
          const idx = occ.tileIndices[0]
          const x = idx % snapshot.world.width
          const y = Math.floor(idx / snapshot.world.width)
          useSimulationStore.getState().focusTile(x, y, undefined)
        }
      }
    } else {
      useSimulationStore.setState({
        runtime: {
          ...state.runtime,
          internalTick,
          simulatedYear: tickToYears(internalTick),
          throttleStatus: throttle.status,
          throttleMessage: throttle.message,
          performance: {
            ...state.runtime.performance,
            simMsPerFrame: simMs,
            lastFrameSimMs: simMs,
          },
        },
      })
    }

    framesSinceFpsSample += 1
    const fpsElapsed = frameStart - lastFpsSampleMs
    if (fpsElapsed >= 1000) {
      const fps = (framesSinceFpsSample / fpsElapsed) * 1000
      useSimulationStore.setState({
        runtime: {
          ...useSimulationStore.getState().runtime,
          performance: {
            ...useSimulationStore.getState().runtime.performance,
            fpsEstimate: Math.round(fps),
          },
        },
      })
      framesSinceFpsSample = 0
      lastFpsSampleMs = frameStart
    }

    runtimeFrameId = requestAnimationFrame(tick)
  }

  runtimeFrameId = requestAnimationFrame(tick)
}

startRuntimeLoop()

export function getSimTimeDisplay(state: ReturnType<typeof useSimulationStore.getState>) {
  return buildSimTimeDisplay(
    state.runtime.internalTick,
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
