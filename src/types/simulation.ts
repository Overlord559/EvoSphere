import type { LifeSnapshot } from './life'
import type { BriefingSnapshot, DeepTimeSummary } from './runtime'

export type { LifeSnapshot } from './life'
export type { BriefingSnapshot, DeepTimeSummary, DeepTimeProgress, RuntimeState, SimSpeed, SelectedSpeciesBriefing } from './runtime'

export type TerrainType =
  | 'deep_ocean'
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'river'
  | 'tundra'
  | 'swamp'
  | 'volcanic'
  | 'hydrothermal_vent'

export interface Tile {
  x: number
  y: number
  terrain: TerrainType
  elevation: number
  moisture: number
  temperature: number
  water: number
  soilFertility: number
  resourceDeposits: number
}

export interface World {
  id: string
  seed: string
  width: number
  height: number
  tiles: Tile[]
  tick: number
}

export interface SimulationSettings {
  seed: string
  worldWidth: number
  worldHeight: number
  tickRate: number
}

export interface SimulationSnapshot {
  tick: number
  worldId: string
  world: World
  events: EventLogEntry[]
  life: LifeSnapshot
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

export type OverlayMode =
  | 'terrain'
  | 'elevation'
  | 'moisture'
  | 'temperature'
  | 'water'
  | 'fertility'
  | 'life'
  | 'biomass'

export interface WorldStats {
  tileCount: number
  terrainDistribution: Partial<Record<TerrainType, number>>
  averageTemperature: number
  averageMoisture: number
  waterCoveragePercent: number
}
