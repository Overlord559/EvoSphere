import type { LifeKind } from './life'

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
}

export interface BriefingSnapshot {
  simulatedYear: number
  estimatedGenerations: number
  era: string
  totalOrganisms: number
  totalBiomass: number
  speciesCount: number
  dominantKind: LifeKind | null
  dominantSpeciesName: string | null
  fastestGrowingSpecies: string | null
  mostThreatenedSpecies: string | null
  latestMajorEvent: string | null
  latestDeepTimeSummary: DeepTimeSummary | null
  /** Populated when a species is selected in UI. */
  selectedSpecies: SelectedSpeciesBriefing | null
}

export interface SelectedSpeciesBriefing {
  speciesId: string
  name: string
  kind: LifeKind
  population: number
  biomass: number
  occupiedTiles: number
  avgGeneration: number
  avgEnergy: number
  avgHealth: number
  dominantTerrain: string | null
  trend: 'growing' | 'stable' | 'threatened' | 'extinct'
  popDelta: number
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

export type SimSpeed = 1 | 10 | 100 | 1000 | 'deep'

export interface RuntimeState {
  isRunning: boolean
  speed: SimSpeed
}

export interface DeepTimeProgress {
  completedTicks: number
  totalTicks: number
  startYear: number
  targetYear: number
  elapsedMs: number
  mode: 'exact' | 'accelerated'
}
