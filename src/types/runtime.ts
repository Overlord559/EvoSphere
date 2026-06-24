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
