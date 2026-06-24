import type { LifeKind, SpeciesRecord, Genome } from '../../types/life'
import type { AgentKind, TrophicRole } from '../../types/agents'
import type { Tile, World } from '../../types/simulation'
import { tileCarryingCapacity as baseTileCapacity, habitatSuitability } from './colonization'
import { environmentalStress } from './energy'
import { countActiveTiles } from '../world/planetMask'

export interface CarryingCapacityContext {
  world: World
  tileBiomass?: number[]
  tileCounts?: number[]
  tileAgentCounts?: number[]
  producerBiomass?: number
  disasterPressure?: number
  herbivoryPressure?: number[]
  species?: SpeciesRecord[]
}

export interface TileCapacityResult {
  capacity: number
  suitability: number
  crowding: number
  expansionRoom: number
}

const NEUTRAL_GENOME: Genome = {
  reproductionRate: 0.4,
  mutationRate: 0.04,
  energyEfficiency: 0.65,
  heatTolerance: 0.5,
  coldTolerance: 0.5,
  waterTolerance: 0.6,
  salinityTolerance: 0.5,
  lightUse: 0.5,
  chemicalUse: 0.5,
  spreadRate: 0.3,
  lifespan: 150,
  droughtResistance: 0.45,
  pressureTolerance: 0.5,
}

function successionMultiplier(tile: Tile): number {
  switch (tile.successionStage) {
    case 'mature':
    case 'forest':
      return 1.15
    case 'grassland':
    case 'pioneer_plants':
      return 1.05
    case 'algal':
    case 'microbial':
      return 0.95
    default:
      return 0.85
  }
}

function ecosystemMultiplier(tile: Tile, kind: LifeKind | AgentKind): number {
  if (kind === 'Algae' && (tile.ecosystem === 'algae_bloom' || tile.ecosystem === 'kelp_coast')) {
    return 1.35
  }
  if (kind === 'PrimitivePlant' && (tile.ecosystem === 'grassland' || tile.ecosystem === 'forest')) {
    return 1.2
  }
  if (
    (kind === 'SimpleGrazer' || kind === 'Scavenger') &&
    (tile.ecosystem === 'grassland' || tile.ecosystem === 'moss_field')
  ) {
    return 1.1
  }
  return 1
}

/** Dynamic per-tile carrying capacity — ecology-driven, not global cap. */
export function getTileCarryingCapacity(
  tile: Tile,
  kind: LifeKind | AgentKind,
  ctx: CarryingCapacityContext,
  genome: Genome = NEUTRAL_GENOME,
): number {
  if (tile.terrain === 'void') return 0

  let base = 0
  if (kind === 'SimpleGrazer' || kind === 'SimplePredator' || kind === 'Scavenger') {
    const biomassIdx = tile.y * ctx.world.width + tile.x
    const producerBiomass = ctx.tileBiomass?.[biomassIdx] ?? 0
    const preyBase = kind === 'SimplePredator' ? 2 : kind === 'Scavenger' ? 3 : 4
    base = Math.min(8, preyBase + Math.floor(producerBiomass * 0.8))
    if (kind === 'Scavenger') base += tile.disturbanceLevel > 0.3 ? 1 : 0
  } else {
    base = baseTileCapacity(kind as LifeKind, tile)
  }

  const stress = 1 - environmentalStress(tile, genome)
  const suit = habitatSuitability(kind as LifeKind, tile, genome)
  const succ = successionMultiplier(tile)
  const eco = ecosystemMultiplier(tile, kind)
  const fertilityBoost = 1 + tile.soilFertility * 0.25 + tile.water * 0.15

  let cap = base * Math.max(0.15, stress) * Math.max(0.2, suit) * succ * eco * fertilityBoost

  const idx = tile.y * ctx.world.width + tile.x
  const herbPressure = ctx.herbivoryPressure?.[idx] ?? 0
  if (herbPressure > 0.4 && (kind === 'Algae' || kind === 'PrimitivePlant')) {
    cap *= Math.max(0.4, 1 - herbPressure * 0.5)
  }

  if (ctx.disasterPressure && ctx.disasterPressure > 0.3) {
    cap *= Math.max(0.3, 1 - ctx.disasterPressure)
  }

  return Math.max(0, Math.round(cap * 10) / 10)
}

export function getTileCapacityDetail(
  tile: Tile,
  kind: LifeKind | AgentKind,
  ctx: CarryingCapacityContext,
  currentOccupancy: number,
  genome: Genome = NEUTRAL_GENOME,
): TileCapacityResult {
  const capacity = getTileCarryingCapacity(tile, kind, ctx, genome)
  const suitability = habitatSuitability(kind as LifeKind, tile, genome)
  const crowding = capacity > 0 ? Math.min(1, currentOccupancy / capacity) : 1
  const expansionRoom = Math.max(0, capacity - currentOccupancy)
  return { capacity, suitability, crowding, expansionRoom }
}

export function getSpeciesHabitatCapacity(
  speciesId: string,
  ctx: CarryingCapacityContext,
): number {
  const species = ctx.species?.find((s) => s.id === speciesId)
  if (!species) return 0

  let total = 0
  for (const tile of ctx.world.tiles) {
    if (tile.terrain === 'void') continue
    const cap = getTileCarryingCapacity(tile, species.kind, ctx)
    const fitnessBoost = 1 + (species.localFitnessScore - 0.5) * 0.3
    total += cap * fitnessBoost
  }
  return Math.round(total)
}

export function getWorldCarryingCapacityByTrophicRole(
  role: TrophicRole,
  ctx: CarryingCapacityContext,
): number {
  const kindMap: Record<TrophicRole, (LifeKind | AgentKind)[]> = {
    producer: ['Algae', 'PhotosyntheticMicrobe', 'ChemosyntheticMicrobe', 'Microbe', 'PrimitivePlant'],
    grazer: ['SimpleGrazer'],
    predator: ['SimplePredator'],
    scavenger: ['Scavenger'],
  }
  const kinds = kindMap[role]
  let total = 0
  for (const tile of ctx.world.tiles) {
    if (tile.terrain === 'void') continue
    for (const kind of kinds) {
      total += getTileCarryingCapacity(tile, kind, ctx)
    }
  }
  return Math.round(total / kinds.length)
}

export function getCrowdingPressure(
  tile: Tile,
  kind: LifeKind | AgentKind,
  currentOccupancy: number,
  ctx: CarryingCapacityContext,
): number {
  const cap = getTileCarryingCapacity(tile, kind, ctx)
  if (cap <= 0) return 1
  return Math.min(1, currentOccupancy / cap)
}

export function getExpansionPressure(
  speciesId: string,
  ctx: CarryingCapacityContext,
  speciesOccupiedTiles: number,
  speciesPopulation: number,
): number {
  const habitatCap = getSpeciesHabitatCapacity(speciesId, ctx)
  if (habitatCap <= 0) return 0
  const fillRatio = speciesPopulation / habitatCap
  const rangeRatio = speciesOccupiedTiles / Math.max(1, countActiveTiles(ctx.world) * 0.15)
  return Math.min(1, Math.max(0, fillRatio * 0.6 + rangeRatio * 0.4))
}
