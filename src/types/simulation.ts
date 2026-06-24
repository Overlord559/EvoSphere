import type { AgentSnapshot } from './agents'
import type { LifeSnapshot } from './life'
import type { BriefingSnapshot, DeepTimeSummary } from './runtime'

export type { LifeSnapshot } from './life'
export type { BriefingSnapshot, DeepTimeSummary, DeepTimeProgress, RuntimeState, SimSpeed, SelectedSpeciesBriefing, LatestDevelopment, AgentVisualState } from './runtime'

/** Abiotic substrate at world birth — life does not paint these as mature biomes. */
export type AbioticTerrainType =
  | 'deep_ocean'
  | 'ocean'
  | 'coast'
  | 'sand'
  | 'rock'
  | 'barren'
  | 'basin'
  | 'fertile_plain'
  | 'desert'
  | 'mountain'
  | 'river'
  | 'tundra'
  | 'snow'
  | 'volcanic'
  | 'hydrothermal_vent'
  | 'void'

/** Life-created ecological overlay — emerges via succession only. */
export type EcosystemType =
  | 'none'
  | 'microbial_mat'
  | 'algae_bloom'
  | 'kelp_coast'
  | 'moss_field'
  | 'grassland'
  | 'forest'
  | 'swamp'
  | 'marsh'
  | 'fungal_zone'
  | 'reef'

export type SuccessionStage =
  | 'none'
  | 'microbial'
  | 'algal'
  | 'pioneer_plants'
  | 'grassland'
  | 'forest'
  | 'swamp'
  | 'marsh'
  | 'mature'

/** Display / legacy union — abiotic + biotic names for overlays and compatibility. */
export type TerrainType =
  | AbioticTerrainType
  | 'grassland'
  | 'forest'
  | 'swamp'
  | 'marsh'

export interface OriginProfile {
  originProfileName: string
  founderTileIds: number[]
  originBiomeTypes: TerrainType[]
  originEnergySources: string[]
  explanation: string
  founderSites: OriginFounderSite[]
  /** v0.5.4e origin scenario metadata */
  originScenarioId?: string
  originScenarioLabel?: string
  scientificOrigin?: boolean
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
  /** Abiotic substrate — set at worldgen, not replaced by succession. */
  terrain: TerrainType
  /** Biological/ecological overlay created by life. */
  ecosystem: EcosystemType
  /** Ecological succession stage on this tile. */
  successionStage: SuccessionStage
  /** Ticks of stable producer biomass at current stage. */
  successionStability: number
  /** Disturbance from disasters, overgrazing, etc. (0–1). */
  disturbanceLevel: number
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
  /** Resolved world archetype label (v0.5.4e). */
  worldArchetypeLabel?: string
}

export type WorldSizePreset = 'small' | 'standard' | 'large' | 'experimental'

export interface SimulationSettings {
  seed: string
  worldWidth: number
  worldHeight: number
  tickRate: number
  worldSizePreset: WorldSizePreset
  /** Origin scenario — default random_mixed uses plausible natural origins. */
  originScenarioId?: import('../simulation/world/originScenarios').OriginScenarioId
  /** World terrain/climate archetype modifier. */
  worldArchetype?: import('../simulation/world/worldArchetypes').WorldArchetypeId
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
