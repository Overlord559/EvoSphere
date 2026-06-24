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
import { globalProfiler, type PerformanceReport } from '../simulation/engine/performanceProfiler'
import { globalSoakTelemetry } from '../simulation/engine/soakTelemetry'
import { WORKER_SIMULATION_ENABLED } from '../simulation/config/simConfig'
import {
  computeCrashRisk,
  estimateSnapshotBytes,
  MAX_TOTAL_ORGANISMS,
  readHeapEstimateMb,
} from '../simulation/engine/simHealth'
import {
  tryCreateWorkerClient,
  WorkerSimulationClient,
  type WorkerPerformanceMetrics,
} from '../simulation/worker/workerClient'
import { destroyAllRenderCaches } from '../ui/viewport/renderCache'
import {
  countActiveRafLoops,
  getWorkerInstanceCount,
  registerRuntimeRaf,
  unregisterRuntimeRaf,
} from '../ui/viewport/lifecycleGuards'
import { yearsToTicks, tickToYears, buildSimTimeDisplay } from '../simulation/engine/simTime'
import { effectiveSpeedForAutoPace, scaledTicksForEra } from '../simulation/engine/eraPacing'
import { parseDisasterSeverityInput } from '../simulation/disasters/DisasterSystem'
import type { DisasterType } from '../simulation/disasters/DisasterTypes'
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
  CameraMode,
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
  heapEstimateMb: null,
  snapshotBytesEstimate: 0,
  workerMessagesPerSec: 0,
  pendingSnapshots: 0,
  pixiGraphicsCount: 6,
  organismBirthsLastInterval: 0,
  organismDeathsLastInterval: 0,
  organismCapUsagePct: 0,
  maxTileLoad: 0,
  crashRiskLevel: 'low',
  terrainRedrawCount: 0,
  runtimeSeconds: 0,
  simulatedYearDisplay: 0,
  snapshotsPerSec: 0,
  snapshotsDropped: 0,
  developmentCount: 0,
  eventCount: 0,
  pixiContainerCount: 6,
  renderTextureCount: 0,
  terrainCacheSize: 0,
  glyphCacheSize: 0,
  agentCountDisplay: 0,
  speciesCountDisplay: 0,
  maxTileAgents: 0,
  rafLoopCount: 1,
  workerInstanceCount: 0,
  cameraMode: 'free',
  cameraUpdatesPerSec: 0,
  heapTrendMbPerMin: null,
  soakWarnings: [],
}

function buildHealthStats(
  snapshot: SimulationSnapshot,
  partial: Partial<PerformanceStats>,
  pendingSnapshots = 0,
  stabilityWarning: string | null = null,
  snapshotsDropped = 0,
  cameraMode: CameraMode = 'free',
): Partial<PerformanceStats> {
  const bytes = estimateSnapshotBytes(snapshot)
  const maxTileOrg = Math.max(0, ...snapshot.life.tileCounts)
  const maxTileAgent = Math.max(0, ...snapshot.agents.tileAgentCounts)
  const organismCapUsagePct = Math.round(
    (snapshot.life.totalOrganisms / MAX_TOTAL_ORGANISMS) * 1000,
  ) / 10
  const speciesCount = snapshot.life.species.filter((s) => s.population > 0).length
  const devCount = snapshot.briefing.latestDevelopments.length

  globalSoakTelemetry.recordBirthDeath(snapshot.life.totalOrganisms)

  const report = globalProfiler.buildReport()
  const soak = globalSoakTelemetry.snapshot({
    simulatedYear: tickToYears(snapshot.tick),
    heapEstimateMb: readHeapEstimateMb(),
    snapshotKb: Math.round(bytes / 1024),
    pendingSnapshots,
    snapshotsDropped,
    workerMessagesPerSec: report.workerMessagesPerSec,
    snapshotsPerSec: report.snapshotsPerSec,
    eventCount: snapshot.events.length,
    developmentCount: devCount,
    pixiGraphicsCount: partial.pixiGraphicsCount ?? 6,
    pixiContainerCount: partial.pixiContainerCount ?? 6,
    renderTextureCount: partial.renderTextureCount ?? 0,
    terrainCacheSize: partial.terrainCacheSize ?? 0,
    glyphCacheSize: partial.glyphCacheSize ?? 0,
    organismCount: snapshot.life.totalOrganisms,
    agentCount: snapshot.agents.totalAgents,
    speciesCount,
    maxTileOrganisms: maxTileOrg,
    maxTileAgents: maxTileAgent,
    rafLoopCount: countActiveRafLoops(),
    workerInstanceCount: getWorkerInstanceCount(),
    cameraMode,
    cameraUpdatesPerSec: partial.cameraUpdatesPerSec ?? 0,
    crashRiskLevel: 'low',
  })

  return {
    snapshotBytesEstimate: bytes,
    pendingSnapshots,
    snapshotsDropped,
    organismCapUsagePct,
    maxTileLoad: maxTileOrg,
    maxTileAgents: maxTileAgent,
    heapEstimateMb: readHeapEstimateMb(),
    runtimeSeconds: soak.runtimeSeconds,
    simulatedYearDisplay: soak.simulatedYear,
    snapshotsPerSec: soak.snapshotsPerSec,
    developmentCount: devCount,
    eventCount: snapshot.events.length,
    agentCountDisplay: snapshot.agents.totalAgents,
    speciesCountDisplay: speciesCount,
    heapTrendMbPerMin: soak.heapTrendMbPerMin,
    soakWarnings: soak.warnings,
    organismBirthsLastInterval: soak.birthsLastInterval,
    organismDeathsLastInterval: soak.deathsLastInterval,
    rafLoopCount: soak.rafLoopCount,
    workerInstanceCount: soak.workerInstanceCount,
    cameraMode,
    cameraUpdatesPerSec: soak.cameraUpdatesPerSec,
    crashRiskLevel: computeCrashRisk({
      organismCount: snapshot.life.totalOrganisms,
      agentCount: snapshot.agents.totalAgents,
      eventCount: snapshot.events.length,
      developmentCount: devCount,
      maxTileOrganisms: maxTileOrg,
      maxTileAgents: maxTileAgent,
      pendingSnapshots,
      snapshotsDropped,
      pixiGraphicsCount: partial.pixiGraphicsCount ?? 6,
      pixiContainerCount: partial.pixiContainerCount ?? 6,
      renderTextureCount: partial.renderTextureCount ?? 0,
      terrainCacheSize: partial.terrainCacheSize ?? 0,
      glyphCacheSize: partial.glyphCacheSize ?? 0,
      snapshotBytesEstimate: bytes,
      rafLoopCount: soak.rafLoopCount,
      workerInstanceCount: soak.workerInstanceCount,
      heapTrendMbPerMin: soak.heapTrendMbPerMin,
      cameraMode,
      cameraUpdatesPerSec: soak.cameraUpdatesPerSec,
      stabilityWarning,
      soakWarnings: soak.warnings,
    }),
    ...partial,
  }
}

function createDefaultRuntime(): RuntimeState {
  return {
    isRunning: true,
    speed: 'normal',
    autoPace: false,
    throttleStatus: 'ok',
    throttleMessage: null,
    pauseWhileInspecting: false,
    followSelectedSpecies: false,
    lockedFollow: false,
    cameraMode: 'free',
    userCameraOverride: false,
    followPanTarget: null,
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
  const validated = validateSelectedSpeciesId(engine, selectedSpeciesId)
  return engine.getSnapshotWithSelectedSpecies(validated, {
    fullBriefing,
    includeOrganisms: includeEntities,
    includeAgents: includeEntities,
  })
}

function validateSelectedSpeciesId(
  engine: SimEngine,
  selectedSpeciesId: string | null,
): string | null {
  if (!selectedSpeciesId) return null
  const snap = engine.getSnapshot(false)
  const lifeSpecies = snap.life.species.find((s) => s.id === selectedSpeciesId)
  if (lifeSpecies && lifeSpecies.population > 0) return selectedSpeciesId
  const hasAgents = snap.agents.agents.some((a) => a.speciesId === selectedSpeciesId)
  if (hasAgents) return selectedSpeciesId
  return null
}

function speciesExistsInSnapshot(snapshot: SimulationSnapshot, speciesId: string): boolean {
  const record = snapshot.life.species.find((s) => s.id === speciesId)
  if (record && record.population > 0) return true
  return snapshot.agents.agents.some((a) => a.speciesId === speciesId)
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
  /** True when Web Worker owns simulation stepping. */
  workerMode: boolean
  workerFallbackReason: string | null
  performanceReport: PerformanceReport | null
  runtime: RuntimeState
  recentActivityTiles: number[]
  deepTimeRunning: boolean
  deepTimeProgress: DeepTimeProgress | null
  deepTimeCancelRequested: boolean
  agentVisualStates: Map<string, AgentVisualState>
  animTimeMs: number
  cameraFocusRequest: CameraFocusRequest | null
  cameraFocusSeq: number
  cameraResetSeq: number
  cameraZoomOutSeq: number
  cameraFitPlanetSeq: number
  /** Cached world id — terrain layer skips redraw when unchanged. */
  cachedTerrainWorldId: string | null

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
  setLockedFollow: (value: boolean) => void
  setUserCameraOverride: (value: boolean) => void
  setCameraMode: (mode: CameraMode) => void
  setFollowPanTarget: (target: { tileX: number; tileY: number } | null) => void
  exitFocus: () => void
  stopFollowing: () => void
  resetCameraView: () => void
  zoomOutCamera: () => void
  fitPlanetCamera: () => void
  updatePerformanceStats: (partial: Partial<PerformanceStats>) => void
  newWorldFromSeed: (seed: string) => void
  newWorldRandomSeed: () => void
  resetWorld: () => void
  stepSimulation: (count?: number) => void
  play: () => void
  pause: () => void
  setSpeed: (speed: SimSpeed) => void
  setAutoPace: (enabled: boolean) => void
  injectDisaster: (type: DisasterType, severity: string) => void
  injectRandomDisaster: () => void
  deepTimeYears: (years: number) => Promise<DeepTimeSummary | null>
  cancelDeepTime: () => void
  advanceAnimation: (deltaMs: number) => void
  syncFromEngine: () => void
  clearCameraFocusRequest: () => void
}

const initialEngine = createEngine(DEFAULT_SETTINGS)
const initialSnapshot = syncSnapshot(initialEngine, null)
const initialVisualStates = syncVisualStates(initialSnapshot.agents.agents, new Map())

let workerClient: WorkerSimulationClient | null = null
let workerBootstrapping = false

function applyWorkerSnapshot(
  snapshot: SimulationSnapshot,
  metrics: WorkerPerformanceMetrics | null,
  recentActivityTiles: number[] = [],
): void {
  const state = useSimulationStore.getState()
  const pending = workerClient?.getPendingSnapshots() ?? 0
  const dropped = workerClient?.getSnapshotsDropped() ?? 0
  const report = metrics?.profile ?? globalProfiler.buildReport()

  let followPanTarget = state.runtime.followPanTarget
  let cameraMode = state.runtime.cameraMode
  if (state.runtime.followSelectedSpecies && state.selectedSpeciesId && !state.runtime.userCameraOverride) {
    const occ = snapshot.life.speciesOccupancy[state.selectedSpeciesId]
    if (occ && occ.tileIndices.length > 0) {
      const idx = occ.tileIndices[0]
      followPanTarget = { tileX: idx % snapshot.world.width, tileY: Math.floor(idx / snapshot.world.width) }
      cameraMode = 'following_species'
    }
  }

  let selectedSpeciesId = state.selectedSpeciesId
  if (selectedSpeciesId && !speciesExistsInSnapshot(snapshot, selectedSpeciesId)) {
    selectedSpeciesId = null
  }

  let speed = state.runtime.speed
  if (state.runtime.autoPace) {
    speed = effectiveSpeedForAutoPace(snapshot.tick, snapshot.life, snapshot.agents)
    if (speed !== state.runtime.speed && workerClient) {
      workerClient.setSpeed(speed)
    }
  }

  useSimulationStore.setState({
    snapshot,
    selectedSpeciesId,
    recentActivityTiles,
    agentVisualStates: syncVisualStates(snapshot.agents.agents, state.agentVisualStates),
    runtime: {
      ...state.runtime,
      speed,
      followPanTarget,
      cameraMode,
      internalTick: metrics?.internalTick ?? snapshot.tick,
      lastSnapshotTick: metrics?.lastSnapshotTick ?? snapshot.lastSnapshotTick,
      simulatedYear: tickToYears(metrics?.internalTick ?? snapshot.tick),
      throttleStatus: metrics?.throttleStatus ?? 'ok',
      throttleMessage: metrics?.throttleMessage ?? snapshot.events[0]?.message ?? null,
      performance: {
        ...state.runtime.performance,
        ...buildHealthStats(snapshot, {
          simMsPerFrame: metrics?.simMsPerBatch ?? 0,
          lastFrameSimMs: metrics?.simMsPerBatch ?? 0,
          workerMessagesPerSec: report.workerMessagesPerSec,
        }, pending, metrics?.throttleMessage ?? null, dropped, cameraMode),
      },
    },
    performanceReport: report,
  })
}

async function bootstrapWorker(settings: SimulationSettings, selectedSpeciesId: string | null): Promise<void> {
  if (!WORKER_SIMULATION_ENABLED || workerBootstrapping || workerClient) return
  workerBootstrapping = true

  const client = await tryCreateWorkerClient(
    {
      onReady: () => {
        useSimulationStore.setState({ workerMode: true, workerFallbackReason: null })
        stopRuntimeLoop()
        startRuntimeLoop()
        if (useSimulationStore.getState().runtime.isRunning) {
          client?.play()
        }
      },
      onInitialized: (snapshot) => {
        applyWorkerSnapshot(snapshot, null, [])
        useSimulationStore.setState({
          snapshot,
          cachedTerrainWorldId: snapshot.worldId,
          settings,
          agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
        })
      },
      onSnapshot: (snapshot, metrics, recentActivityTiles) => {
        applyWorkerSnapshot(snapshot, metrics, recentActivityTiles)
      },
      onDeepTimeProgress: (progress) => {
        useSimulationStore.setState({ deepTimeProgress: progress })
      },
      onDeepTimeComplete: (summary, snapshot, cancelled) => {
        applyWorkerSnapshot(snapshot, null, [])
        useSimulationStore.setState({
          deepTimeRunning: false,
          deepTimeProgress: null,
          deepTimeCancelRequested: false,
          runtime: {
            ...createDefaultRuntime(),
            internalTick: snapshot.tick,
            lastSnapshotTick: snapshot.lastSnapshotTick,
            simulatedYear: tickToYears(snapshot.tick),
          },
        })
        if (!cancelled && summary) {
          void summary
        }
        if (useSimulationStore.getState().runtime.isRunning) {
          workerClient?.play()
        } else {
          startRuntimeLoop()
        }
      },
      onError: (message, fatal) => {
        if (fatal) {
          workerClient?.terminate()
          workerClient = null
          useSimulationStore.setState({
            workerMode: false,
            workerFallbackReason: message,
          })
          startRuntimeLoop()
        }
      },
    },
    settings,
    selectedSpeciesId,
  )

  workerBootstrapping = false
  if (client) {
    workerClient = client
  } else {
    useSimulationStore.setState({
      workerMode: false,
      workerFallbackReason: 'Worker unavailable — main-thread fallback',
    })
    startRuntimeLoop()
  }
}

async function reinitWorker(settings: SimulationSettings, selectedSpeciesId: string | null): Promise<void> {
  workerClient?.terminate()
  workerClient = null
  workerBootstrapping = false
  destroyAllRenderCaches()
  globalSoakTelemetry.reset()
  await bootstrapWorker(settings, selectedSpeciesId)
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'briefing',
  phase: 'v0.5.2b long-run soak + focus escape UX',
  overlayMode: 'terrain',
  visualMode: 'organic',
  selectedTile: null,
  selectedSpeciesId: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: initialSnapshot,
  workerMode: false,
  workerFallbackReason: null,
  performanceReport: null,
  cachedTerrainWorldId: initialSnapshot.worldId,
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
  cameraResetSeq: 0,
  cameraZoomOutSeq: 0,
  cameraFitPlanetSeq: 0,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setVisualMode: (mode) => set({ visualMode: mode }),

  selectTile: (tile) => {
    if (!tile || tile.terrain === 'void') {
      set({ selectedTile: tile?.terrain === 'void' ? tile : null })
      return
    }
    set({
      selectedTile: tile,
      activePanel: 'inspector',
      runtime: {
        ...get().runtime,
        cameraMode: 'focused_tile',
        followPanTarget: { tileX: tile.x, tileY: tile.y },
      },
    })
  },

  selectSpecies: (speciesId) => {
    const { engine, workerMode, snapshot } = get()
    if (!speciesExistsInSnapshot(snapshot, speciesId) && !workerMode) {
      const validated = validateSelectedSpeciesId(engine, speciesId)
      if (!validated) return
    }
    if (workerMode && workerClient) {
      workerClient.setSelectedSpecies(speciesId)
      set({
        selectedSpeciesId: speciesId,
        activePanel: 'species',
        runtime: {
          ...get().runtime,
          cameraMode: 'focused_species',
        },
      })
      return
    }
    const nextSnapshot = syncSnapshot(engine, speciesId)
    set({
      selectedSpeciesId: speciesId,
      activePanel: 'species',
      snapshot: nextSnapshot,
      agentVisualStates: syncVisualStates(nextSnapshot.agents.agents, get().agentVisualStates),
      runtime: {
        ...get().runtime,
        cameraMode: 'focused_species',
      },
    })
  },

  clearSelectedSpecies: () => {
    const { engine, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.setSelectedSpecies(null)
      set({
        selectedSpeciesId: null,
        runtime: {
          ...get().runtime,
          cameraMode: 'free',
          followSelectedSpecies: false,
          followPanTarget: null,
        },
      })
      return
    }
    const snapshot = syncSnapshot(engine, null)
    set({
      selectedSpeciesId: null,
      snapshot,
      agentVisualStates: syncVisualStates(snapshot.agents.agents, get().agentVisualStates),
    })
  },

  focusSpecies: (speciesId) => {
    const { engine, snapshot, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.setSelectedSpecies(speciesId)
    }
    const nextSnapshot = workerMode ? get().snapshot : syncSnapshot(engine, speciesId)
    const occ = snapshot.life.speciesOccupancy[speciesId]
    const updates: Partial<SimulationStore> = {
      selectedSpeciesId: speciesId,
      activePanel: 'species',
      snapshot: workerMode ? get().snapshot : nextSnapshot,
      agentVisualStates: workerMode
        ? get().agentVisualStates
        : syncVisualStates(nextSnapshot.agents.agents, get().agentVisualStates),
      runtime: {
        ...get().runtime,
        cameraMode: 'focused_species',
        userCameraOverride: false,
        followPanTarget: null,
      },
    }

    if (occ && occ.tileIndices.length > 0) {
      const idx = occ.tileIndices[Math.floor(occ.tileIndices.length / 2)]
      const x = idx % snapshot.world.width
      const y = Math.floor(idx / snapshot.world.width)
      updates.cameraFocusRequest = { tileX: x, tileY: y, zoom: 3, id: get().cameraFocusSeq + 1 }
      updates.cameraFocusSeq = get().cameraFocusSeq + 1
      updates.runtime = { ...updates.runtime!, followPanTarget: { tileX: x, tileY: y } }
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
    if (get().workerMode && workerClient) {
      void reinitWorker(nextSettings, null).then(() => {
        set({
          settings: nextSettings,
          selectedTile: null,
          selectedSpeciesId: null,
          recentActivityTiles: [],
          deepTimeProgress: null,
          deepTimeCancelRequested: false,
          agentVisualStates: new Map(),
          animTimeMs: 0,
          runtime: { ...createDefaultRuntime(), isRunning: true },
        })
        workerClient?.play()
        startRuntimeLoop()
      })
      return
    }
    const nextEngine = createEngine(nextSettings)
    const snapshot = syncSnapshot(nextEngine, null)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot,
      cachedTerrainWorldId: snapshot.worldId,
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
    set({
      runtime: {
        ...get().runtime,
        followSelectedSpecies: value,
        cameraMode: value && get().selectedSpeciesId ? 'following_species' : get().runtime.cameraMode,
      },
    }),

  setLockedFollow: (value) => set({ runtime: { ...get().runtime, lockedFollow: value } }),

  setUserCameraOverride: (value) =>
    set({
      runtime: {
        ...get().runtime,
        userCameraOverride: value,
        followSelectedSpecies: value && !get().runtime.lockedFollow ? false : get().runtime.followSelectedSpecies,
        cameraMode: value ? 'free' : get().runtime.cameraMode,
        followPanTarget: value ? null : get().runtime.followPanTarget,
      },
    }),

  setCameraMode: (mode) => set({ runtime: { ...get().runtime, cameraMode: mode } }),

  setFollowPanTarget: (target) => set({ runtime: { ...get().runtime, followPanTarget: target } }),

  exitFocus: () => {
    set({
      selectedTile: null,
      runtime: {
        ...get().runtime,
        cameraMode: 'free',
        followSelectedSpecies: false,
        userCameraOverride: false,
        followPanTarget: null,
      },
      cameraResetSeq: get().cameraResetSeq + 1,
    })
  },

  stopFollowing: () => {
    set({
      runtime: {
        ...get().runtime,
        followSelectedSpecies: false,
        lockedFollow: false,
        cameraMode: get().selectedSpeciesId ? 'focused_species' : 'free',
        followPanTarget: null,
      },
    })
  },

  resetCameraView: () => set({ cameraResetSeq: get().cameraResetSeq + 1 }),

  zoomOutCamera: () => set({ cameraZoomOutSeq: get().cameraZoomOutSeq + 1 }),

  fitPlanetCamera: () => set({ cameraFitPlanetSeq: get().cameraFitPlanetSeq + 1 }),

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
    if (get().workerMode && workerClient) {
      void reinitWorker(nextSettings, null).then(() => {
        set({
          settings: nextSettings,
          selectedTile: null,
          selectedSpeciesId: null,
          recentActivityTiles: [],
          deepTimeProgress: null,
          deepTimeCancelRequested: false,
          agentVisualStates: new Map(),
          animTimeMs: 0,
          runtime: { ...createDefaultRuntime(), isRunning: true },
        })
        workerClient?.play()
        startRuntimeLoop()
      })
      return
    }
    const nextEngine = createEngine(nextSettings)
    const snapshot = syncSnapshot(nextEngine, null)
    set({
      settings: nextSettings,
      engine: nextEngine,
      snapshot,
      cachedTerrainWorldId: snapshot.worldId,
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
    const { engine, settings, selectedSpeciesId, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.reset({ ...settings })
      set({
        selectedTile: null,
        recentActivityTiles: [],
        deepTimeProgress: null,
        deepTimeCancelRequested: false,
        agentVisualStates: new Map(),
        runtime: { ...get().runtime, isRunning: true },
      })
      workerClient.play()
      startRuntimeLoop()
      return
    }
    engine.reset({ ...settings })
    const snapshot = syncSnapshot(engine, selectedSpeciesId)
    set({
      snapshot,
      cachedTerrainWorldId: snapshot.worldId,
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
    const { engine, selectedSpeciesId, agentVisualStates, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.step(count, 'normal')
      return
    }
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
      performanceReport: globalProfiler.buildReport(),
    })
  },

  play: () => {
    const { runtime, workerMode } = get()
    if (runtime.isRunning) return
    set({ runtime: { ...runtime, isRunning: true } })
    if (workerMode && workerClient) {
      workerClient.play()
    }
    startRuntimeLoop()
  },

  pause: () => {
    const { workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.pause()
    }
    stopRuntimeLoop()
    const { runtime } = get()
    set({ runtime: { ...runtime, isRunning: false } })
  },

  setSpeed: (speed) => {
    const { runtime, workerMode } = get()
    set({ runtime: { ...runtime, speed, autoPace: false } })
    if (workerMode && workerClient) {
      workerClient.setSpeed(speed)
    }
  },

  setAutoPace: (enabled) => {
    const { runtime, snapshot, workerMode } = get()
    const nextSpeed = enabled
      ? effectiveSpeedForAutoPace(snapshot.tick, snapshot.life, snapshot.agents)
      : runtime.speed
    set({ runtime: { ...runtime, autoPace: enabled, speed: nextSpeed } })
    if (workerMode && workerClient) {
      workerClient.setSpeed(nextSpeed)
    }
  },

  injectDisaster: (type, severity) => {
    const severityValue = parseDisasterSeverityInput(severity)
    const { engine, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.injectDisaster(type, severityValue)
      return
    }
    engine.injectDisaster(type, severityValue)
    get().syncFromEngine()
  },

  injectRandomDisaster: () => {
    const { engine, workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.injectRandomDisaster()
      return
    }
    engine.injectRandomDisaster()
    get().syncFromEngine()
  },

  cancelDeepTime: () => {
    const { workerMode } = get()
    if (workerMode && workerClient) {
      workerClient.cancelDeepTime()
    }
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
    const { engine, runtime, selectedSpeciesId, workerMode } = get()

    if (workerMode && workerClient) {
      set({
        deepTimeRunning: true,
        deepTimeCancelRequested: false,
        runtime: { ...runtime, isRunning: false, speed: 'deep' },
      })
      workerClient.runDeepTime(years, selectedSpeciesId)
      return null
    }

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
  unregisterRuntimeRaf()
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
  registerRuntimeRaf()
  lastSnapshotMs = performance.now()

  const tick = () => {
    const frameStart = performance.now()
    const state = useSimulationStore.getState()

    if (!state.runtime.isRunning || state.deepTimeRunning) {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    if (state.workerMode && workerClient) {
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
          performanceReport: globalProfiler.buildReport(),
        })
        framesSinceFpsSample = 0
        lastFpsSampleMs = frameStart
      }
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    if (state.runtime.pauseWhileInspecting && state.selectedTile) {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    const baseSpeed = state.runtime.autoPace
      ? effectiveSpeedForAutoPace(state.runtime.internalTick, state.snapshot.life, state.snapshot.agents)
      : state.runtime.speed
    if (baseSpeed === 'deep') {
      runtimeFrameId = requestAnimationFrame(tick)
      return
    }

    const schedule = SPEED_SCHEDULE[baseSpeed]
    let ticksAttempted = ticksForBudget(schedule, state.runtime.performance.lastFrameSimMs, avgMsPerTick)
    ticksAttempted = scaledTicksForEra(
      ticksAttempted,
      state.runtime.internalTick,
      state.snapshot.life,
      state.snapshot.agents,
    )
    const simMs = state.engine.step(ticksAttempted, false, baseSpeed)
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
      const includeEntities = baseSpeed === 'normal' || baseSpeed === 'fast' || needSnapshot
      const snapshot = syncSnapshot(
        state.engine,
        state.selectedSpeciesId,
        fullBriefing,
        includeEntities,
      )
      let selectedSpeciesId = state.selectedSpeciesId
      if (selectedSpeciesId && !speciesExistsInSnapshot(snapshot, selectedSpeciesId)) {
        selectedSpeciesId = null
      }
      lastSnapshotMs = frameStart

      useSimulationStore.setState({
        snapshot,
        selectedSpeciesId,
        recentActivityTiles: state.engine.getRecentActivityTileIndices(),
        agentVisualStates: syncVisualStates(snapshot.agents.agents, state.agentVisualStates),
        runtime: {
          ...state.runtime,
          speed: state.runtime.autoPace ? baseSpeed : state.runtime.speed,
          internalTick,
          lastSnapshotTick: state.engine.getLastSnapshotTick(),
          simulatedYear: tickToYears(internalTick),
          throttleStatus: throttle.status,
          throttleMessage: throttle.message,
          followPanTarget:
            state.runtime.followSelectedSpecies && state.selectedSpeciesId && !state.runtime.userCameraOverride
              ? (() => {
                  const occ = snapshot.life.speciesOccupancy[state.selectedSpeciesId]
                  if (!occ || occ.tileIndices.length === 0) return state.runtime.followPanTarget
                  const idx = occ.tileIndices[0]
                  return { tileX: idx % snapshot.world.width, tileY: Math.floor(idx / snapshot.world.width) }
                })()
              : state.runtime.followPanTarget,
          cameraMode:
            state.runtime.followSelectedSpecies && state.selectedSpeciesId && !state.runtime.userCameraOverride
              ? 'following_species'
              : state.runtime.cameraMode,
          performance: {
            ...state.runtime.performance,
            simMsPerFrame: simMs,
            lastFrameSimMs: simMs,
            ...buildHealthStats(snapshot, {}, 0, stabilityWarning, 0, state.runtime.cameraMode),
          },
        },
      })
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

if (WORKER_SIMULATION_ENABLED) {
  void bootstrapWorker(DEFAULT_SETTINGS, null)
} else {
  startRuntimeLoop()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workerClient?.terminate()
    workerClient = null
    stopRuntimeLoop()
    destroyAllRenderCaches()
    globalSoakTelemetry.reset()
  })
}

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
