import type { EntityKind } from './life'

export interface DeepTimeSummary {
  startTick: number
  endTick: number
  startYear: number
  endYear: number
  startOrganisms: number
  endOrganisms: number
  organismDelta: number
  startBiomass: number
  endBiomass: number
  biomassDelta: number
  startSpecies: number
  endSpecies: number
  speciesDelta: number
  extinctions: string[]
  newSpecies: string[]
  dominantSpeciesBefore: string | null
  dominantSpeciesAfter: string | null
  majorDieOffs: number
  majorBlooms: number
  colonizedTilesBefore: number
  colonizedTilesAfter: number
  colonizedTilesDelta: number
  changedTilesCount: number
  elapsedSimYears: number
  runtimeSeconds: number
  /** Population delta for species selected at deep-time start (if any). */
  selectedSpeciesId: string | null
  selectedSpeciesName: string | null
  selectedSpeciesPopBefore: number | null
  selectedSpeciesPopAfter: number | null
  selectedSpeciesPopDelta: number | null
  startGrazers: number
  endGrazers: number
  grazerDelta: number
  startPredators: number
  endPredators: number
  predatorDelta: number
  predationCount: number
  starvationCount: number
  localExtinctions: number
  dominantTrophicShift: string | null
}

export interface LatestDevelopment {
  id: string
  message: string
  severity: 'info' | 'warning' | 'positive'
  year: number
  tick: number
  /** Optional tile focus for viewport navigation. */
  focusTileX?: number
  focusTileY?: number
}

export type BiosphereState =
  | 'active'
  | 'compressed'
  | 'basal_only'
  | 'mobile_extinction'
  | 'recovering'
  | 'true_extinction'

export type MapVisibilityMode = 'yes' | 'no' | 'density-only' | 'compressed'

export interface ReseedState {
  lastReseedEvent: string | null
  lastReseedMode: string | null
  lastReseedTileX: number | null
  lastReseedTileY: number | null
  lastReseedTick: number | null
  lastReseedConfirmed: boolean
  lastReseedMessage: string | null
}

export interface BriefingSnapshot {
  simulatedYear: number
  estimatedGenerations: number
  era: string
  totalOrganisms: number
  totalBiomass: number
  speciesCount: number
  dominantKind: EntityKind | null
  dominantSpeciesName: string | null
  fastestGrowingSpecies: string | null
  mostThreatenedSpecies: string | null
  latestMajorEvent: string | null
  latestDeepTimeSummary: DeepTimeSummary | null
  /** Populated when a species is selected in UI. */
  selectedSpecies: SelectedSpeciesBriefing | null
  dominantGrazerSpecies: string | null
  dominantPredatorSpecies: string | null
  predatorPreyTrend: string | null
  foodWebWarning: string | null
  recentFoodWebEvent: string | null
  /** Natural-language developments derived from live simulation state. */
  latestDevelopments: LatestDevelopment[]
  /** v0.5 environmental selection narratives from real species metrics. */
  selectionNarratives: string[]
  /** Active disaster summaries for briefing panel. */
  activeDisasters: ActiveDisaster[]
  /** Origin profile explanation when available. */
  originExplanation: string | null
  /** Ecological succession overview (v0.5.4). */
  successionOverview: SuccessionOverview | null
  /** Bottleneck / recovery status. */
  bottleneckStatus: string | null
  /** Proto-cognition milestone summary. */
  protoCognitionSummary: string | null
  /** Disaster pacing summary for UI. */
  disasterPacingSummary: string | null
  /** Population architecture summary for briefing/UI. */
  populationArchitecture: PopulationArchitectureBriefing | null
  /** v0.5.4e render budget / representative cap summary */
  renderBudgetSummary: string | null
  /** v0.5.4e extinction forensics headline */
  extinctionForensicsSummary: string | null
  /** Planet-wide extinction event (all life lost) */
  planetExtinctionCause: string | null
  /** Origin scenario label for UI */
  originScenarioLabel: string | null
  /** World archetype label for UI */
  worldArchetypeLabel: string | null
  /** v0.5.4f biosphere health — not the same as tracked organism count */
  biosphereState: BiosphereState
  biosphereStateLabel: string | null
  /** Last manual/planet reseed confirmation */
  reseedState: ReseedState | null
  /** v0.6 era director summary */
  eraDirectorSummary: string | null
  /** v0.6 oxygenation headline */
  oxygenationSummary: string | null
  /** v0.6 background biosphere note */
  backgroundBiosphereSummary: string | null
  /** v0.6 sapient clade headline */
  sapientCladeSummary: string | null
  /** v0.6 civilization headline */
  civilizationSummary: string | null
  /** v0.6.1 core life growth / block headlines */
  lifeGrowthSummary: string | null
}

export interface PopulationArchitectureBriefing {
  trackedOrganisms: number
  aggregateOrganisms: number
  trackedAgents: number
  agentReserve: number
  worldCarryingCapacity: number
  capacityPressurePct: number
  expansionPressurePct: number
  artificialCapEngaged: boolean
  representationCapped: boolean
  bottleneckKind: string | null
  plateauExplanation: string | null
  /** v0.5.4d cohort representation. */
  populationUnitsCount: number
  estimatedBiologicalPopulation: number
  compressionRatio: number
  representationSummary: string | null
}

export interface SuccessionOverview {
  barrenPercent: number
  microbialPercent: number
  algalPercent: number
  pioneerPercent: number
  grasslandPercent: number
  forestPercent: number
  swampMarshPercent: number
}

export interface SelectedSpeciesBriefing {
  speciesId: string
  name: string
  kind: import('./life').EntityKind
  trophicRole: import('./agents').TrophicRole
  population: number
  biomass: number
  occupiedTiles: number
  avgGeneration: number
  avgEnergy: number
  avgHealth: number
  dominantTerrain: string | null
  trend: 'growing' | 'stable' | 'threatened' | 'extinct'
  popDelta: number
  predatorLinks: string[]
  preyLinks: string[]
  bodyPlanSummary: string | null
  sensesSummary: string | null
  environmentalFitnessScore: number | null
  selectionPressures: string[]
  extinctionRisk: number | null
  adaptationNotes: string[]
  /** v0.5.4e forensics when inspecting species */
  lastCauseOfDecline?: string | null
  hiddenAsAggregate?: boolean
  convertedToCohort?: boolean
  populationChangeReason?: string | null
  visibilityStatus?: import('./life').SpeciesVisibilityStatus
  trackedRepresentatives?: number
  populationUnitsCount?: number
  mapVisibilityMode?: MapVisibilityMode
}

export interface SimulationSnapshot {
  tick: number
  worldId: string
  world: import('./simulation').World
  events: EventLogEntry[]
  life: import('./life').LifeSnapshot
  briefing: BriefingSnapshot
  lastDeepTimeSummary: DeepTimeSummary | null
}

export interface EventLogEntry {
  id: string
  tick: number
  type: string
  message: string
  timestamp: number
}

export type EventCategory =
  | 'life.first'
  | 'life.bloom'
  | 'life.die_off'
  | 'life.extinction'
  | 'life.speciation'
  | 'life.colonization'
  | 'life.population_shift'
  | 'life.reproduce'
  | 'world.deep_time_summary'
  | 'world.generated'
  | 'world.reset'
  | 'world.tick'
  | 'agent.spawned'
  | 'agent.migrated'
  | 'agent.grazed'
  | 'agent.predation'
  | 'agent.starved'
  | 'agent.reproduced'
  | 'agent.local_extinction'
  | 'foodweb.prey_collapse'
  | 'foodweb.predator_starvation'
  | 'foodweb.population_cycle'

export type SimSpeed = 'normal' | 'fast' | 'superfast' | 'ultrafast' | 'deep'

export interface ActiveDisaster {
  id: string
  type: string
  severity: string
  severityValue: number
  startTick: number
  durationTicks: number
  affectedTileIds: number[]
  effectSummary: string
  lifeImpact: string
  agentImpact: string
  biomeImpact: string
}

export interface DisasterSnapshot {
  active: ActiveDisaster[]
  recentEnded: ActiveDisaster[]
  stressTileIds: number[]
  settings?: import('../simulation/config/disasterConfig').DisasterSettings
  lastMajorDisasterYear?: number
  lastMassExtinctionYear?: number
}

export type ThrottleStatus = 'ok' | 'catching_up' | 'throttled' | 'overloaded'

export type CrashRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type CameraMode =
  | 'free'
  | 'focused_tile'
  | 'focused_species'
  | 'following_species'
  | 'inspecting_agent'

export type SoakWarningSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SoakWarning {
  code: string
  message: string
  severity: SoakWarningSeverity
}

export interface PerformanceStats {
  fpsEstimate: number
  simMsPerFrame: number
  lastFrameSimMs: number
  drawnTiles: number
  drawnAgents: number
  drawnPlantTiles: number
  lodLevel: 'far' | 'medium' | 'close'
  /** Browser heap estimate in MB when performance.memory is available. */
  heapEstimateMb: number | null
  /** Rough JSON byte estimate for last snapshot applied. */
  snapshotBytesEstimate: number
  workerMessagesPerSec: number
  pendingSnapshots: number
  pixiGraphicsCount: number
  organismBirthsLastInterval: number
  organismDeathsLastInterval: number
  organismCapUsagePct: number
  maxTileLoad: number
  crashRiskLevel: CrashRiskLevel
  terrainRedrawCount: number
  /** Long-run soak telemetry (v0.5.2b). */
  runtimeSeconds: number
  simulatedYearDisplay: number
  snapshotsPerSec: number
  snapshotsDropped: number
  developmentCount: number
  eventCount: number
  pixiContainerCount: number
  renderTextureCount: number
  terrainCacheSize: number
  glyphCacheSize: number
  agentCountDisplay: number
  speciesCountDisplay: number
  maxTileAgents: number
  rafLoopCount: number
  workerInstanceCount: number
  cameraMode: CameraMode
  cameraUpdatesPerSec: number
  heapTrendMbPerMin: number | null
  soakWarnings: SoakWarning[]
  /** v0.5.4e representative rendering caps */
  renderedMovingGlyphs: number
  renderedProducerGlyphs: number
  renderedStaticMarkers: number
  visibleCohortCount: number
  skippedGlyphs: number
  densityOnlyMode: boolean
  maxMovingGlyphCap: number
  maxProducerGlyphCap: number
  livingSpeciesMarked: number
  estimatedPopVsRenderedReps: string | null
  /** v0.6.2 WASM kernel backend status */
  kernelBackend?: 'ts' | 'wasm' | 'wasm-fallback'
  /** v0.6.3 showcase soak telemetry */
  renderPipelineDisplay?: string
  marker3dCount?: number
  mesh3dCount?: number
  /** v0.6.4 engine smoothness */
  renderMsLastFrame?: number
  renderQualityTier?: string
  /** Render budget bridge — candidates before sampling */
  candidateMovingGlyphs?: number
  candidateProducerGlyphs?: number
  candidateStaticGlyphs?: number
  skippedMovingGlyphs?: number
  skippedProducerGlyphs?: number
  skippedStaticMarkers?: number
  showcaseAggregateTiles?: number
  showcaseAggregateMarkers?: number
}

export interface RuntimeState {
  isRunning: boolean
  speed: SimSpeed
  /** When true, effective speed follows era-based Auto Pace profile. */
  autoPace: boolean
  throttleStatus: ThrottleStatus
  /** Warning message when simulation degrades. */
  throttleMessage: string | null
  pauseWhileInspecting: boolean
  followSelectedSpecies: boolean
  /** When true, manual pan/zoom does not disable species follow. */
  lockedFollow: boolean
  cameraMode: CameraMode
  /** User manually moved camera — suppresses auto-follow until cleared. */
  userCameraOverride: boolean
  /** Soft follow target updated on snapshot (not cameraFocusRequest spam). */
  followPanTarget: { tileX: number; tileY: number } | null
  performance: PerformanceStats
  /** Internal tick counter mirrored from engine (may lead snapshot). */
  internalTick: number
  lastSnapshotTick: number
  simulatedYear: number
}

export interface CameraFocusRequest {
  tileX: number
  tileY: number
  zoom?: number
  id: number
}

export interface AgentVisualState {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  progress: number
  lastAction: string
}

export interface DeepTimeProgress {
  completedTicks: number
  totalTicks: number
  startYear: number
  targetYear: number
  currentYear: number
  elapsedMs: number
  mode: 'exact'
  estimatedRemainingMs: number | null
}
