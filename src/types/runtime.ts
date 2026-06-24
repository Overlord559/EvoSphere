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

export type ThrottleStatus = 'ok' | 'catching_up' | 'throttled' | 'overloaded'

export interface PerformanceStats {
  fpsEstimate: number
  simMsPerFrame: number
  lastFrameSimMs: number
  drawnTiles: number
  drawnAgents: number
  drawnPlantTiles: number
  lodLevel: 'far' | 'medium' | 'close'
}

export interface RuntimeState {
  isRunning: boolean
  speed: SimSpeed
  throttleStatus: ThrottleStatus
  /** Warning message when simulation degrades. */
  throttleMessage: string | null
  pauseWhileInspecting: boolean
  followSelectedSpecies: boolean
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
