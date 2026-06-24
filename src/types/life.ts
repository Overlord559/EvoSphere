export type LifeKind =
  | 'Microbe'
  | 'PhotosyntheticMicrobe'
  | 'ChemosyntheticMicrobe'
  | 'Algae'
  | 'PrimitivePlant'

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

export interface SpeciesRecord {
  id: string
  name: string
  kind: LifeKind
  ancestorSpeciesId: string | null
  createdAtTick: number
  population: number
  totalBiomass: number
  generation: number
}

export interface TileLifeData {
  count: number
  biomass: number
  organisms: LifeOrganism[]
}

export interface LifeSnapshot {
  organisms: LifeOrganism[]
  species: SpeciesRecord[]
  totalOrganisms: number
  totalBiomass: number
  /** Per-tile organism count (length = world.width * world.height). */
  tileCounts: number[]
  /** Per-tile biomass sum. */
  tileBiomass: number[]
}

export const MAX_ORGANISMS_PER_TILE = 4
export const MAX_TOTAL_ORGANISMS = 5000
export const BASE_METABOLISM = 0.018
export const REPRODUCTION_ENERGY_THRESHOLD = 0.62
export const REPRODUCTION_ENERGY_COST = 0.35
