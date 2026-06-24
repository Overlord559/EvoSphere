import type { AgentSnapshot } from './agents'
import type { LifeSnapshot } from './life'
import type { BriefingSnapshot, DeepTimeSummary } from './runtime'

export type { LifeSnapshot } from './life'
export type { BriefingSnapshot, DeepTimeSummary, DeepTimeProgress, RuntimeState, SimSpeed, SelectedSpeciesBriefing, LatestDevelopment, AgentVisualState } from './runtime'

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
  | 'snow'
  | 'swamp'
  | 'marsh'
  | 'volcanic'
  | 'hydrothermal_vent'
  | 'void'

export interface OriginProfile {
  originProfileName: string
  founderTileIds: number[]
  originBiomeTypes: TerrainType[]
  originEnergySources: string[]
  explanation: string
  founderSites: OriginFounderSite[]
}

export interface OriginFounderSite {
  tileIndex: number
  x: number
  y: number
  lifeKind: import('./life').LifeKind
  energySource: string
}

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
  /** Planet center in tile coordinates. */
  planetCenterX: number
  planetCenterY: number
  /** Active-world radius in tile units. */
  planetRadius: number
  /** Per-tile active mask — false = space/void outside planet. */
  activeMask: boolean[]
  /** Deterministic founder-life origin profile for this world. */
  originProfile: OriginProfile
}

export type WorldSizePreset = 'small' | 'standard' | 'large' | 'experimental'

export interface SimulationSettings {
  seed: string
  worldWidth: number
  worldHeight: number
  tickRate: number
  worldSizePreset: WorldSizePreset
}

export interface SimulationSnapshot {
  tick: number
  worldId: string
  world: World
  events: EventLogEntry[]
  life: LifeSnapshot
  agents: AgentSnapshot
  briefing: BriefingSnapshot
  lastDeepTimeSummary: DeepTimeSummary | null
  /** Monotonic version — increments when UI-facing snapshot is rebuilt. */
  renderSnapshotVersion: number
  /** Internal tick when this snapshot was assembled. */
  lastSnapshotTick: number
  /** Active natural disasters (v0.5.3). */
  disasters: import('./runtime').DisasterSnapshot
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
