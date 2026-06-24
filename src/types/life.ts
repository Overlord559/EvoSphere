import type { AgentKind, TrophicRole } from './agents'

export type LifeKind =
  | 'Microbe'
  | 'PhotosyntheticMicrobe'
  | 'ChemosyntheticMicrobe'
  | 'Algae'
  | 'PrimitivePlant'

/** Producer + mobile agent archetypes tracked in species registry. */
export type EntityKind = LifeKind | AgentKind

export type EnergySource = 'photosynthesis' | 'chemosynthesis' | 'mixed'

export interface Genome {
  reproductionRate: number
  mutationRate: number
  energyEfficiency: number
  heatTolerance: number
  coldTolerance: number
  waterTolerance: number
  salinityTolerance: number
  lightUse: number
  chemicalUse: number
  spreadRate: number
  lifespan: number
  droughtResistance: number
  pressureTolerance: number
}

export interface LifeOrganism {
  id: string
  speciesId: string
  kind: LifeKind
  x: number
  y: number
  energy: number
  health: number
  age: number
  maxAge: number
  reproductionCooldown: number
  genome: Genome
  energySource: EnergySource
  generation: number
  biomass: number
}

export type TaxonRank = 'variant' | 'subspecies' | 'species'

export type EstablishmentStatus = 'emerging' | 'stable' | 'failed'

export interface SpeciesRecord {
  id: string
  name: string
  kind: EntityKind
  trophicRole: TrophicRole
  ancestorSpeciesId: string | null
  parentSpeciesId: string | null
  createdAtTick: number
  population: number
  totalBiomass: number
  generation: number
  /** True for shared archetype founder lineages seeded at world init. */
  isFounderLineage?: boolean
  /** Species ids this species preys on (food web). */
  preySpeciesIds: string[]
  /** Species ids that prey on this species. */
  predatorSpeciesIds: string[]
  isMobile: boolean
  /** Taxonomic rank — variant → subspecies → species. */
  taxonRank: TaxonRank
  establishmentYear: number
  establishmentStatus: EstablishmentStatus
  localFitnessScore: number
  adaptedTerrain: import('./simulation').TerrainType | null
  adaptedClimate: string | null
  populationTrend: 'growing' | 'stable' | 'declining' | 'unknown'
  /** Grace ticks for emerging branches. */
  establishmentGraceTicks: number
  /** Species-level learned behavior memory (proto-cognition). */
  speciesMemoryScore: number
}

export interface TileLifeData {
  count: number
  biomass: number
  organisms: LifeOrganism[]
}

export interface SpeciesOccupancy {
  speciesId: string
  /** Tile indices (y * width + x) where this species has organisms. */
  tileIndices: number[]
  occupiedTileCount: number
  avgGeneration: number
  avgEnergy: number
  avgHealth: number
  dominantTerrain: import('./simulation').TerrainType | null
}

export interface LifeSnapshot {
  organisms: LifeOrganism[]
  species: SpeciesRecord[]
  /** Individually tracked organism count (render/inspection budget). */
  totalOrganisms: number
  /** Aggregate pool population not represented as individual entities. */
  aggregateOrganisms: number
  /** Tracked + aggregate combined biological population. */
  totalBiologicalPopulation: number
  totalBiomass: number
  aggregateBiomass: number
  /** Per-tile organism count (length = world.width * world.height). */
  tileCounts: number[]
  /** Per-tile biomass sum (tracked + aggregate). */
  tileBiomass: number[]
  /** Precomputed occupancy per alive species id. */
  speciesOccupancy: Record<string, SpeciesOccupancy>
  /** Population architecture telemetry. */
  populationArchitecture: PopulationArchitectureMetrics
}

export interface PopulationArchitectureMetrics {
  trackedIndividuals: number
  aggregatePopulation: number
  totalBiologicalPopulation: number
  worldCarryingCapacityEstimate: number
  capacityPressurePct: number
  expansionPressurePct: number
  artificialCapEngaged: boolean
  representationCapped: boolean
  bottleneckKind: import('../simulation/evolution/bottleneckRecovery').BottleneckKind | null
}

export const MAX_ORGANISMS_PER_TILE = 4
/** @deprecated Use populationConfig maxTrackedIndividuals — kept for QA reference only. */
export const MAX_TOTAL_ORGANISMS = 5000
export const BASE_METABOLISM = 0.018
export const REPRODUCTION_ENERGY_THRESHOLD = 0.62
export const REPRODUCTION_ENERGY_COST = 0.35
