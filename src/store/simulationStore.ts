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
  readHeapEstimateMb,
} from '../simulation/engine/simHealth'
import { LEGACY_MAX_TOTAL_ORGANISMS } from '../simulation/ecology/populationConfig'
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
  resetLifecycleGuards,
  unregisterRuntimeRaf,
} from '../ui/viewport/lifecycleGuards'
import {
  getKernelBackend,
  initWasmKernel,
} from '../simulation/wasm/kernelAdapter'
import type { KernelBackend } from '../simulation/wasm/kernelTypes'
import { isWasmKernelEnvEnabled, writeWasmKernelFlagToStorage } from '../simulation/wasm/wasmFeatureFlags'
import { yearsToTicks, tickToYears, buildSimTimeDisplay } from '../simulation/engine/simTime'
import { effectiveSpeedForAutoPaceWithDirector, scaledTicksForEraWithDirector } from '../simulation/engine/eraPacing'
import type { EraDirectorMode } from '../simulation/era/eraTypes'
import type { SpeciesFocusFilter } from '../ui/panels/speciesFocus'
import { parseDisasterSeverityInput } from '../simulation/disasters/DisasterSystem'
import type { DisasterType } from '../simulation/disasters/DisasterTypes'
import {
  DEFAULT_WORLD_SIZE_PRESET,
  dimensionsForPreset,
  settingsWithPreset,
} from '../simulation/world/worldSizePresets'
import type { OriginScenarioId } from '../simulation/world/originScenarios'
import type { WorldArchetypeId } from '../simulation/world/worldArchetypes'
import type { ReseedMode } from '../simulation/life/lifeReseed'
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
import { isSpeciesBiologicallyAlive } from '../simulation/ecology/speciesVisibility'
import {
  activeReseedEffects,
  createReseedVisualEffect,
  type ReseedVisualEffect,
} from '../ui/viewport/reseedEffects'
import {
  resolveCameraPreset2D,
  resolveCameraPreset3D,
  type CameraPresetId,
} from '../ui/showcase/cameraPresets'
import {
  showcasePresetById,
  type ShowcasePresetId,
} from '../ui/showcase/showcaseConfig'
import {
  eraPresetById,
  type EraPresetId,
} from '../ui/showcase/eraPresets'
import { applyEraPresetToEngine } from '../simulation/era/eraPresetSeeder'
import {
  DEFAULT_RENDER_QUALITY_TIER,
  type RenderQualityTier,
} from '../ui/viewport/renderQualityTier'
import type { OrbitState } from '../ui/viewport3d/cameraControls'

export type PanelId = 'world' | 'species' | 'events' | 'inspector' | 'briefing' | 'roadmap' | 'era'

export type WorkerInitState = 'idle' | 'loading' | 'ready' | 'error' | 'fallback'

export type VisualMode = 'organic' | 'debug'

/** v0.6.3 render pipeline — 2.5D default; classic2d is internal fallback only; 3D is experimental. */
export type RenderPipeline = 'classic2d' | '2.5d' | '3d'

const DEFAULT_DIMS = dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET)

const DEFAULT_SETTINGS: SimulationSettings = {
  seed: 'evosphere-prime',
  worldWidth: DEFAULT_DIMS.width,
  worldHeight: DEFAULT_DIMS.height,
  tickRate: 1,
  worldSizePreset: DEFAULT_WORLD_SIZE_PRESET,
  originScenarioId: 'random_mixed',
  worldArchetype: 'earthlike',
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
  renderedMovingGlyphs: 0,
  renderedProducerGlyphs: 0,
  renderedStaticMarkers: 0,
  visibleCohortCount: 0,
  skippedGlyphs: 0,
  densityOnlyMode: false,
  maxMovingGlyphCap: 150,
  maxProducerGlyphCap: 120,
  livingSpeciesMarked: 0,
  estimatedPopVsRenderedReps: null,
  kernelBackend: 'ts',
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
  const popArch = snapshot.life.populationArchitecture
  const organismCapUsagePct = Math.round(
    (popArch.capacityPressurePct > 0
      ? popArch.capacityPressurePct
      : (snapshot.life.totalOrganisms / LEGACY_MAX_TOTAL_ORGANISMS) * 100),
  ) / 10
  const biologicalPop = snapshot.life.totalBiologicalPopulation + snapshot.agents.totalMobilePopulation
  const speciesCount = snapshot.life.species.filter((s) => s.population > 0).length
  const devCount = snapshot.briefing.latestDevelopments.length

  globalSoakTelemetry.recordBirthDeath(biologicalPop)

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
      biologicalPopulation: biologicalPop,
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

function syncEraDirectorSettings(
  engine: SimEngine,
  state: {
    eraDirectorMode: EraDirectorMode
    speculativeSapientsEnabled: boolean
    eraAutoFocus: boolean
    showBackgroundBiosphere: boolean
    arcadeEvolutionMode?: boolean
  },
  extra?: Partial<import('../simulation/era/eraTypes').EraDirectorSettings>,
): void {
  engine.getEraDirector().setSettings({
    mode: state.eraDirectorMode,
    speculativeSapientsEnabled: state.speculativeSapientsEnabled,
    autoFocusEnabled: state.eraAutoFocus,
    showBackgroundBiosphere: state.showBackgroundBiosphere,
    sandboxPaceMultiplier: state.arcadeEvolutionMode ? 8 : 1,
    ...extra,
  })
  engine.getCivilizationSystem().setSpeculativeEnabled(state.speculativeSapientsEnabled)
}

/** Route era director settings to the active sim path (worker or main-thread engine). */
function syncEraDirectorToActiveSim(
  state: {
    eraDirectorMode: EraDirectorMode
    speculativeSapientsEnabled: boolean
    eraAutoFocus: boolean
    showBackgroundBiosphere: boolean
    arcadeEvolutionMode: boolean
  },
  extra?: Partial<import('../simulation/era/eraTypes').EraDirectorSettings>,
): void {
  const settings = {
    mode: state.eraDirectorMode,
    speculativeSapientsEnabled: state.speculativeSapientsEnabled,
    autoFocusEnabled: state.eraAutoFocus,
    showBackgroundBiosphere: state.showBackgroundBiosphere,
    sandboxPaceMultiplier: state.arcadeEvolutionMode ? 8 : 1,
    ...extra,
  }
  const { workerMode, engine } = useSimulationStore.getState()
  if (workerMode && workerClient) {
    workerClient.setEraDirectorSettings(settings)
    return
  }
  engine.getEraDirector().setSettings(settings)
  engine.getCivilizationSystem().setSpeculativeEnabled(settings.speculativeSapientsEnabled)
}

function createEngine(settings: SimulationSettings): SimEngine {
  const engine = new SimEngine({ ...settings })
  syncEraDirectorSettings(engine, {
    eraDirectorMode: 'science',
    speculativeSapientsEnabled: false,
    eraAutoFocus: true,
    showBackgroundBiosphere: false,
  })
  return engine
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
  if (lifeSpecies && isSpeciesBiologicallyAlive(lifeSpecies, snap.life.speciesOccupancy[selectedSpeciesId])) {
    return selectedSpeciesId
  }
  const hasAgents = snap.agents.agents.some((a) => a.speciesId === selectedSpeciesId)
  if (hasAgents) return selectedSpeciesId
  return null
}

function speciesExistsInSnapshot(snapshot: SimulationSnapshot, speciesId: string): boolean {
  const record = snapshot.life.species.find((s) => s.id === speciesId)
  if (record && isSpeciesBiologicallyAlive(record, snapshot.life.speciesOccupancy[speciesId])) {
    return true
  }
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
  workerInitState: WorkerInitState
  workerFallbackReason: string | null
  /** Internal tick when disaster settings were last synced to worker (soak/debug). */
  workerDisasterSyncTick: number | null
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
  reseedVisualEffects: ReseedVisualEffect[]
  recentlyReseededSpeciesIds: string[]
  recentlyReseededTileIndices: number[]
  speciesFocusFilter: SpeciesFocusFilter
  eraDirectorMode: EraDirectorMode
  speculativeSapientsEnabled: boolean
  eraAutoFocus: boolean
  showBackgroundBiosphere: boolean
  renderPipeline: RenderPipeline
  useWasmKernel: boolean
  kernelBackend: KernelBackend
  /** v0.6.3 portfolio showcase · v0.6.4 arcade evolution */
  showcaseMode: boolean
  arcadeEvolutionMode: boolean
  screenshotMode: boolean
  uiHidden: boolean
  soakHudExpanded: boolean
  /** Default camera for showcase / screenshot capture. */
  showcaseCameraPreset: CameraPresetId
  showcasePresetId: ShowcasePresetId
  eraPresetId: EraPresetId | null
  renderQualityTier: RenderQualityTier
  cameraPresetSeq: number
  camera3dOrbitSeq: number
  camera3dOrbit: OrbitState | null

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
  newWorldFromSeed: (seed: string, settingsOverride?: SimulationSettings) => void
  newWorldRandomSeed: () => void
  setOriginScenario: (id: OriginScenarioId) => void
  setWorldArchetype: (id: WorldArchetypeId) => void
  reseedLife: (mode?: ReseedMode) => void
  resetWorld: () => void
  stepSimulation: (count?: number) => void
  play: () => void
  pause: () => void
  setSpeed: (speed: SimSpeed) => void
  setAutoPace: (enabled: boolean) => void
  setEraDirectorMode: (mode: EraDirectorMode) => void
  setSpeculativeSapients: (enabled: boolean) => void
  setEraAutoFocus: (enabled: boolean) => void
  setShowBackgroundBiosphere: (enabled: boolean) => void
  setRenderPipeline: (pipeline: RenderPipeline) => void
  setUseWasmKernel: (enabled: boolean) => void
  setSpeciesFocusFilter: (filter: SpeciesFocusFilter) => void
  injectDisaster: (type: DisasterType, severity: string) => void
  injectRandomDisaster: () => void
  setDisasterSettings: (partial: Partial<import('../simulation/config/disasterConfig').DisasterSettings>) => void
  deepTimeYears: (years: number) => Promise<DeepTimeSummary | null>
  cancelDeepTime: () => void
  advanceAnimation: (deltaMs: number) => void
  syncFromEngine: () => void
  clearCameraFocusRequest: () => void
  setShowcaseMode: (enabled: boolean) => void
  setScreenshotMode: (enabled: boolean) => void
  setUiHidden: (hidden: boolean) => void
  setSoakHudExpanded: (expanded: boolean) => void
  enableShowcaseMode: () => void
  enableArcadeEvolutionMode: () => void
  applyShowcasePreset: (presetId: ShowcasePresetId) => void
  applyEraPreset: (presetId: EraPresetId) => void
  setRenderQualityTier: (tier: RenderQualityTier) => void
  applyCameraPreset: (presetId: CameraPresetId) => void
}

const initialEngine = createEngine(DEFAULT_SETTINGS)
const initialSnapshot = syncSnapshot(initialEngine, null)
const initialVisualStates = syncVisualStates(initialSnapshot.agents.agents, new Map())

let workerClient: WorkerSimulationClient | null = null
let workerBootstrapping = false
let workerBootstrapGeneration = 0

function fallbackToMainThreadSim(settings: SimulationSettings, reason: string): void {
  workerClient?.terminate()
  workerClient = null
  workerBootstrapping = false
  const nextEngine = createEngine(settings)
  const snapshot = syncSnapshot(nextEngine, null)
  useSimulationStore.setState({
    engine: nextEngine,
    snapshot,
    cachedTerrainWorldId: snapshot.worldId,
    workerMode: false,
    workerInitState: 'fallback',
    workerFallbackReason: reason,
    agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
    runtime: {
      ...useSimulationStore.getState().runtime,
      internalTick: snapshot.tick,
      lastSnapshotTick: snapshot.lastSnapshotTick,
      simulatedYear: tickToYears(snapshot.tick),
    },
  })
  startRuntimeLoop()
}

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
    speed = effectiveSpeedForAutoPaceWithDirector(snapshot)
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

async function bootstrapWorker(settings: SimulationSettings, selectedSpeciesId: string | null): Promise<boolean> {
  if (!WORKER_SIMULATION_ENABLED || typeof Worker === 'undefined') return false
  if (workerBootstrapping) return false
  const generation = ++workerBootstrapGeneration
  workerBootstrapping = true
  useSimulationStore.setState({ workerInitState: 'loading', workerFallbackReason: null })

  const client = await tryCreateWorkerClient(
    {
      onReady: () => {
        if (generation !== workerBootstrapGeneration) return
        useSimulationStore.setState({ workerMode: true, workerInitState: 'ready', workerFallbackReason: null })
        const state = useSimulationStore.getState()
        syncEraDirectorToActiveSim({
          eraDirectorMode: state.eraDirectorMode,
          speculativeSapientsEnabled: state.speculativeSapientsEnabled,
          eraAutoFocus: state.eraAutoFocus,
          showBackgroundBiosphere: state.showBackgroundBiosphere,
          arcadeEvolutionMode: state.arcadeEvolutionMode,
        })
        stopRuntimeLoop()
        startRuntimeLoop()
      },
      onInitialized: (snapshot) => {
        if (generation !== workerBootstrapGeneration) return
        applyWorkerSnapshot(snapshot, null, [])
        useSimulationStore.setState({
          snapshot,
          cachedTerrainWorldId: snapshot.worldId,
          settings,
          agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
        })
      },
      onSnapshot: (snapshot, metrics, recentActivityTiles) => {
        if (generation !== workerBootstrapGeneration) return
        applyWorkerSnapshot(snapshot, metrics, recentActivityTiles)
      },
      onDeepTimeProgress: (progress) => {
        if (generation !== workerBootstrapGeneration) return
        useSimulationStore.setState({ deepTimeProgress: progress })
      },
      onDeepTimeComplete: (summary, snapshot, cancelled) => {
        if (generation !== workerBootstrapGeneration) return
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
        if (generation !== workerBootstrapGeneration) return
        if (fatal) {
          fallbackToMainThreadSim(
            useSimulationStore.getState().settings,
            `Worker error — main-thread fallback: ${message}`,
          )
        } else {
          useSimulationStore.setState({ workerFallbackReason: message })
        }
      },
    },
    settings,
    selectedSpeciesId,
  )

  workerBootstrapping = false
  if (generation !== workerBootstrapGeneration) {
    client?.terminate()
    return false
  }
  if (client) {
    workerClient = client
    const disasterSettings = useSimulationStore.getState().engine.getDisasterSystem().getSettings()
    client.setDisasterSettings(disasterSettings)
    useSimulationStore.setState({ workerDisasterSyncTick: useSimulationStore.getState().engine.getInternalTick() })
    if (useSimulationStore.getState().runtime.isRunning) {
      client.play()
    }
    return true
  }

  useSimulationStore.setState({
    workerMode: false,
    workerInitState: 'fallback',
    workerFallbackReason: 'Worker unavailable — main-thread fallback',
  })
  return false
}

async function reinitWorker(settings: SimulationSettings, selectedSpeciesId: string | null): Promise<boolean> {
  workerBootstrapGeneration += 1
  workerClient?.terminate()
  workerClient = null
  workerBootstrapping = false
  destroyAllRenderCaches()
  globalSoakTelemetry.reset()
  return bootstrapWorker(settings, selectedSpeciesId)
}

async function loadShowcaseWorld(nextSettings: SimulationSettings): Promise<void> {
  stopRuntimeLoop()
  if (WORKER_SIMULATION_ENABLED) {
    const workerOk = await reinitWorker(nextSettings, null)
    if (workerOk) {
      useSimulationStore.setState({
        settings: nextSettings,
        selectedTile: null,
        selectedSpeciesId: null,
        recentActivityTiles: [],
        deepTimeProgress: null,
        deepTimeCancelRequested: false,
        agentVisualStates: new Map(),
        animTimeMs: 0,
        runtime: { ...createDefaultRuntime(), isRunning: false },
        workerMode: true,
        workerInitState: 'ready',
      })
      return
    }
  }
  const nextEngine = createEngine(nextSettings)
  const snapshot = syncSnapshot(nextEngine, null)
  useSimulationStore.setState({
    settings: nextSettings,
    engine: nextEngine,
    snapshot,
    cachedTerrainWorldId: snapshot.worldId,
    selectedTile: null,
    selectedSpeciesId: null,
    runtime: {
      ...createDefaultRuntime(),
      internalTick: snapshot.tick,
      lastSnapshotTick: snapshot.lastSnapshotTick,
      simulatedYear: tickToYears(snapshot.tick),
    },
    recentActivityTiles: [],
    deepTimeProgress: null,
    deepTimeCancelRequested: false,
    agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
    animTimeMs: 0,
    workerMode: false,
    workerInitState: 'fallback',
    workerFallbackReason: WORKER_SIMULATION_ENABLED
      ? 'Worker unavailable — main-thread fallback'
      : null,
  })
}

function finishShowcaseArcadeBootstrap(cameraPreset: CameraPresetId, bootstrapSteps: number): void {
  syncEraDirectorToActiveSim(
    {
      eraDirectorMode: 'cinematic',
      speculativeSapientsEnabled: useSimulationStore.getState().speculativeSapientsEnabled,
      eraAutoFocus: useSimulationStore.getState().eraAutoFocus,
      showBackgroundBiosphere: useSimulationStore.getState().showBackgroundBiosphere,
      arcadeEvolutionMode: true,
    },
    { mode: 'cinematic', sandboxPaceMultiplier: 8 },
  )
  bootstrapShowcaseSteps(bootstrapSteps)
  applyResolvedCamera2D(resolveCameraPreset2D(useSimulationStore.getState().snapshot, cameraPreset))
  useSimulationStore.getState().play()
  startRuntimeLoop()
}

function bootstrapShowcaseSteps(steps: number): void {
  const state = useSimulationStore.getState()
  const pace: SimSpeed = state.arcadeEvolutionMode ? 'ultrafast' : 'fast'
  if (state.workerMode && workerClient) {
    workerClient.step(steps, pace)
    workerClient.play()
    return
  }
  state.engine.step(steps, false, pace)
  const snapshot = syncSnapshot(state.engine, null)
  useSimulationStore.setState({
    snapshot,
    recentActivityTiles: state.engine.getRecentActivityTileIndices(),
    agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
    runtime: {
      ...state.runtime,
      isRunning: true,
      internalTick: state.engine.getInternalTick(),
      lastSnapshotTick: state.engine.getLastSnapshotTick(),
      simulatedYear: tickToYears(state.engine.getInternalTick()),
    },
  })
}

function applyResolvedCamera2D(resolved: ReturnType<typeof resolveCameraPreset2D>): void {
  if (resolved.fitPlanet) {
    useSimulationStore.getState().fitPlanetCamera()
    return
  }
  if (resolved.tileX != null && resolved.tileY != null) {
    useSimulationStore.getState().focusTile(resolved.tileX, resolved.tileY, resolved.zoom ?? 3.5)
  }
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activePanel: 'briefing',
  phase: 'v0.6.4 Engine Smoothness — arcade evolution · era launcher · 2.5D polish',
  overlayMode: 'terrain',
  visualMode: 'organic',
  selectedTile: null,
  selectedSpeciesId: null,
  settings: { ...DEFAULT_SETTINGS },
  engine: initialEngine,
  snapshot: initialSnapshot,
  workerMode: false,
  workerInitState: 'idle',
  workerFallbackReason: null,
  workerDisasterSyncTick: null,
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
  reseedVisualEffects: [],
  recentlyReseededSpeciesIds: [],
  recentlyReseededTileIndices: [],
  speciesFocusFilter: 'auto',
  eraDirectorMode: 'science',
  speculativeSapientsEnabled: false,
  eraAutoFocus: true,
  showBackgroundBiosphere: false,
  renderPipeline: '2.5d',
  useWasmKernel: isWasmKernelEnvEnabled(),
  kernelBackend: 'ts' as KernelBackend,
  showcaseMode: false,
  arcadeEvolutionMode: false,
  screenshotMode: false,
  uiHidden: false,
  soakHudExpanded: false,
  showcaseCameraPreset: 'life_bloom_coast',
  showcasePresetId: 'prime',
  eraPresetId: null,
  renderQualityTier: DEFAULT_RENDER_QUALITY_TIER,
  cameraPresetSeq: 0,
  camera3dOrbitSeq: 0,
  camera3dOrbit: null,

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

  updatePerformanceStats: (partial) => {
    const now = performance.now()
    const force =
      partial.terrainRedrawCount != null ||
      partial.crashRiskLevel === 'high' ||
      partial.crashRiskLevel === 'critical'
    if (!force && now - lastPerfStatsPushMs < 250) return
    lastPerfStatsPushMs = now
    set({
      runtime: {
        ...get().runtime,
        performance: { ...get().runtime.performance, ...partial },
      },
    })
  },

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

  newWorldFromSeed: (seed, settingsOverride) => {
    stopRuntimeLoop()
    const trimmed = seed.trim()
    if (!trimmed) return
    const { settings } = get()
    const nextSettings = settingsOverride ?? { ...settings, seed: trimmed }
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

  setOriginScenario: (id) => {
    const { settings } = get()
    get().newWorldFromSeed(settings.seed, { ...settings, originScenarioId: id })
  },

  setWorldArchetype: (id) => {
    const { settings } = get()
    get().newWorldFromSeed(settings.seed, { ...settings, worldArchetype: id })
  },

  reseedLife: (mode = 'default') => {
    const { engine, animTimeMs } = get()
    const seeded = engine.reseedLife(mode)
    if (seeded > 0) {
      const reseedState = engine.getReseedState()
      let effects = activeReseedEffects(get().reseedVisualEffects, animTimeMs)
      if (reseedState.lastReseedTileX != null && reseedState.lastReseedTileY != null) {
        effects = [
          ...effects,
          createReseedVisualEffect(
            mode,
            reseedState.lastReseedTileX,
            reseedState.lastReseedTileY,
            animTimeMs,
            mode === 'alien',
          ),
        ]
      }
      const snapshot = syncSnapshot(engine, get().selectedSpeciesId)
      set({
        snapshot,
        recentActivityTiles: engine.getRecentActivityTileIndices(),
        reseedVisualEffects: effects,
        recentlyReseededSpeciesIds: engine.getRecentlyReseededSpeciesIds(),
        recentlyReseededTileIndices: engine.getRecentlyReseededTileIndices(),
      })
    }
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
    syncEraDirectorSettings(engine, get())
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
      ? effectiveSpeedForAutoPaceWithDirector(snapshot)
      : runtime.speed
    set({ runtime: { ...runtime, autoPace: enabled, speed: nextSpeed } })
    if (workerMode && workerClient) {
      workerClient.setSpeed(nextSpeed)
    }
  },

  setEraDirectorMode: (mode) => {
    set({ eraDirectorMode: mode })
    syncEraDirectorToActiveSim({ ...get(), eraDirectorMode: mode })
    if (mode === 'cinematic') {
      get().setAutoPace(true)
      get().setSpeed('ultrafast')
    }
    get().syncFromEngine()
  },

  setSpeculativeSapients: (enabled) => {
    set({ speculativeSapientsEnabled: enabled })
    syncEraDirectorToActiveSim({ ...get(), speculativeSapientsEnabled: enabled })
    get().syncFromEngine()
  },

  setEraAutoFocus: (enabled) => {
    set({ eraAutoFocus: enabled })
    syncEraDirectorToActiveSim({ ...get(), eraAutoFocus: enabled })
    get().syncFromEngine()
  },

  setShowBackgroundBiosphere: (enabled) => {
    set({ showBackgroundBiosphere: enabled })
    syncEraDirectorToActiveSim({ ...get(), showBackgroundBiosphere: enabled })
    get().syncFromEngine()
  },

  setRenderPipeline: (pipeline) => set({ renderPipeline: pipeline }),

  setUseWasmKernel: (enabled) => {
    writeWasmKernelFlagToStorage(enabled)
    set({ useWasmKernel: enabled })
    void initWasmKernel(enabled).then((backend) => {
      set({ kernelBackend: backend })
    })
  },

  setSpeciesFocusFilter: (filter) => set({ speciesFocusFilter: filter }),

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

  setDisasterSettings: (partial) => {
    const { engine, workerMode } = get()
    engine.getDisasterSystem().setSettings(partial)
    if (workerMode && workerClient) {
      workerClient.setDisasterSettings(partial)
      set({ workerDisasterSyncTick: engine.getInternalTick() })
    }
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
    const { agentVisualStates, animTimeMs, reseedVisualEffects } = get()
    const nextAnimMs = animTimeMs + deltaMs
    set({
      animTimeMs: nextAnimMs,
      agentVisualStates: advanceAgentInterpolation(
        agentVisualStates,
        deltaMs,
        INTERPOLATION_DURATION_MS,
      ),
      reseedVisualEffects: activeReseedEffects(reseedVisualEffects, nextAnimMs),
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

  setShowcaseMode: (enabled) => {
    set({
      showcaseMode: enabled,
      ...(enabled
        ? {}
        : { screenshotMode: false, uiHidden: false, soakHudExpanded: false }),
    })
  },

  setScreenshotMode: (enabled) =>
    set({
      screenshotMode: enabled,
      uiHidden: enabled ? true : get().uiHidden,
      soakHudExpanded: enabled ? false : get().soakHudExpanded,
      showcaseMode: enabled ? true : get().showcaseMode,
    }),

  setUiHidden: (hidden) => set({ uiHidden: hidden }),

  setSoakHudExpanded: (expanded) => set({ soakHudExpanded: expanded }),

  enableShowcaseMode: () => {
    get().enableArcadeEvolutionMode()
  },

  enableArcadeEvolutionMode: () => {
    set({
      showcaseMode: true,
      arcadeEvolutionMode: true,
      screenshotMode: false,
      uiHidden: false,
      soakHudExpanded: false,
      visualMode: 'organic',
      overlayMode: 'life',
      renderPipeline: '2.5d',
      eraDirectorMode: 'cinematic',
      activePanel: 'briefing',
      showcasePresetId: 'prime',
      showcaseCameraPreset: 'life_bloom_coast',
      eraPresetId: null,
      renderQualityTier: DEFAULT_RENDER_QUALITY_TIER,
    })
    get().applyShowcasePreset('prime')
  },

  applyShowcasePreset: (presetId) => {
    const preset = showcasePresetById(presetId)
    const { settings } = get()
    const nextSettings = {
      ...settings,
      seed: preset.seed,
      originScenarioId: preset.originScenarioId,
      worldArchetype: preset.worldArchetype,
    }
    set({
      showcasePresetId: presetId,
      showcaseMode: true,
      eraDirectorMode: 'cinematic',
      settings: nextSettings,
    })
    void loadShowcaseWorld(nextSettings).then(() => {
      finishShowcaseArcadeBootstrap(get().showcaseCameraPreset, preset.bootstrapSteps)
    })
  },

  applyEraPreset: (presetId) => {
    const preset = eraPresetById(presetId)
    const { settings } = get()
    const nextSettings = {
      ...settings,
      seed: preset.seed,
      originScenarioId: preset.originScenarioId,
      worldArchetype: preset.worldArchetype,
    }
    set({
      eraPresetId: presetId,
      showcaseMode: true,
      arcadeEvolutionMode: true,
      eraDirectorMode: 'cinematic',
      settings: nextSettings,
      renderPipeline: '2.5d',
    })
    void loadShowcaseWorld(nextSettings).then(() => {
      syncEraDirectorToActiveSim(
        {
          eraDirectorMode: 'cinematic',
          speculativeSapientsEnabled: preset.speculative || get().speculativeSapientsEnabled,
          eraAutoFocus: get().eraAutoFocus,
          showBackgroundBiosphere: get().showBackgroundBiosphere,
          arcadeEvolutionMode: true,
        },
        { mode: 'cinematic', sandboxPaceMultiplier: 8 },
      )
      if (get().workerMode && workerClient) {
        workerClient.applyEraPreset(preset)
        applyResolvedCamera2D(resolveCameraPreset2D(get().snapshot, get().showcaseCameraPreset))
        get().play()
        startRuntimeLoop()
        return
      }
      const engine = useSimulationStore.getState().engine
      applyEraPresetToEngine(engine, preset, (type, message) => engine.logEvent(type, message))
      const snapshot = syncSnapshot(engine, null)
      useSimulationStore.setState({
        snapshot,
        recentActivityTiles: engine.getRecentActivityTileIndices(),
        agentVisualStates: syncVisualStates(snapshot.agents.agents, new Map()),
        runtime: {
          ...useSimulationStore.getState().runtime,
          isRunning: true,
          internalTick: engine.getInternalTick(),
          lastSnapshotTick: engine.getLastSnapshotTick(),
          simulatedYear: tickToYears(engine.getInternalTick()),
          speed: 'ultrafast',
          autoPace: true,
        },
      })
      applyResolvedCamera2D(resolveCameraPreset2D(snapshot, get().showcaseCameraPreset))
      get().play()
      startRuntimeLoop()
    })
  },

  setRenderQualityTier: (tier) => set({ renderQualityTier: tier }),

  applyCameraPreset: (presetId) => {
    const snapshot = get().snapshot
    const resolved2d = resolveCameraPreset2D(snapshot, presetId)
    const resolved3d = resolveCameraPreset3D(snapshot, presetId)
    applyResolvedCamera2D(resolved2d)
    set({
      cameraPresetSeq: get().cameraPresetSeq + 1,
      camera3dOrbit: resolved3d.orbit,
      camera3dOrbitSeq: get().camera3dOrbitSeq + 1,
      runtime: {
        ...get().runtime,
        cameraMode: 'free',
        userCameraOverride: false,
        followPanTarget: null,
      },
    })
  },
}))

let runtimeFrameId: number | null = null
let lastSnapshotMs = 0
let avgMsPerTick = 1.2
let lastFpsSampleMs = performance.now()
let framesSinceFpsSample = 0
let viewportDrivesSimulation = false
let lastPerfStatsPushMs = 0
let lastRuntimeUiPushMs = 0

/** When viewport is mounted it owns the single RAF (sim + render). */
export function setViewportDrivesSimulation(active: boolean): void {
  viewportDrivesSimulation = active
  if (active) {
    stopRuntimeLoop()
  } else {
    startRuntimeLoop()
  }
}

export function processSimulationFrame(): void {
  const frameStart = performance.now()
  const state = useSimulationStore.getState()

  if (!state.runtime.isRunning || state.deepTimeRunning) {
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
            rafLoopCount: countActiveRafLoops(),
            kernelBackend: getKernelBackend(),
          },
        },
        performanceReport: globalProfiler.buildReport(),
      })
      framesSinceFpsSample = 0
      lastFpsSampleMs = frameStart
    }
    return
  }

  if (state.runtime.pauseWhileInspecting && state.selectedTile) {
    return
  }

  const baseSpeed = state.runtime.autoPace
    ? effectiveSpeedForAutoPaceWithDirector(state.snapshot)
    : state.runtime.speed
  if (baseSpeed === 'deep') {
    return
  }

  const schedule = SPEED_SCHEDULE[baseSpeed]
  let ticksAttempted = ticksForBudget(schedule, state.runtime.performance.lastFrameSimMs, avgMsPerTick)
  ticksAttempted = scaledTicksForEraWithDirector(ticksAttempted, state.snapshot)
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
          rafLoopCount: countActiveRafLoops(),
          kernelBackend: getKernelBackend(),
          ...buildHealthStats(snapshot, {}, 0, stabilityWarning, 0, state.runtime.cameraMode),
        },
      },
    })
  } else {
    const now = frameStart
    const throttleChanged =
      state.runtime.throttleStatus !== throttle.status ||
      state.runtime.throttleMessage !== throttle.message
    if (throttleChanged || now - lastRuntimeUiPushMs >= 120) {
      lastRuntimeUiPushMs = now
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
            rafLoopCount: countActiveRafLoops(),
            kernelBackend: getKernelBackend(),
          },
        },
      })
    }
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
          rafLoopCount: countActiveRafLoops(),
        },
      },
    })
    framesSinceFpsSample = 0
    lastFpsSampleMs = frameStart
  }
}

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
  if (viewportDrivesSimulation) return
  stopRuntimeLoop()
  registerRuntimeRaf()
  lastSnapshotMs = performance.now()

  const tick = () => {
    processSimulationFrame()
    runtimeFrameId = requestAnimationFrame(tick)
  }

  runtimeFrameId = requestAnimationFrame(tick)
}

if (WORKER_SIMULATION_ENABLED) {
  void bootstrapWorker(DEFAULT_SETTINGS, null).then((ok) => {
    if (!ok) {
      fallbackToMainThreadSim(DEFAULT_SETTINGS, 'Worker unavailable — main-thread fallback')
    }
  })
} else {
  startRuntimeLoop()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workerClient?.terminate()
    workerClient = null
    stopRuntimeLoop()
    resetLifecycleGuards()
    destroyAllRenderCaches()
    globalSoakTelemetry.reset()
  })
}

if (import.meta.env.DEV) {
  ;(globalThis as { __evosphereQa?: { store: typeof useSimulationStore } }).__evosphereQa = {
    store: useSimulationStore,
  }
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
