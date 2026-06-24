import type { Genome, LifeKind } from '../../types/life'
import type { Tile } from '../../types/simulation'
import { effectiveHabitatTerrain } from '../world/terrainHelpers'
import { environmentalStress } from './energy'

const LAND_SUBSTRATES = new Set([
  'barren',
  'sand',
  'rock',
  'fertile_plain',
  'basin',
  'desert',
  'mountain',
  'tundra',
  'coast',
  'volcanic',
  'snow',
])

const WATER_TERRAINS = new Set([
  'ocean',
  'coast',
  'river',
  'deep_ocean',
  'hydrothermal_vent',
  'basin',
])

export function tileCarryingCapacity(kind: LifeKind, tile: Tile): number {
  if (tile.terrain === 'void') return 0
  const stress = 1 - environmentalStress(tile, createNeutralGenome())
  let base = 1
  switch (kind) {
    case 'ChemosyntheticMicrobe':
      if (tile.terrain === 'hydrothermal_vent') base = 4
      else if (tile.terrain === 'volcanic' || tile.terrain === 'deep_ocean') base = 2
      else base = 0
      break
    case 'PhotosyntheticMicrobe':
      base = tile.water > 0.25 && tile.terrain !== 'deep_ocean' ? 3 : 1
      break
    case 'Algae':
      base =
        (WATER_TERRAINS.has(tile.terrain) || tile.ecosystem === 'algae_bloom') && tile.water > 0.35
          ? 4
          : 0
      break
    case 'PrimitivePlant':
      base =
        (LAND_SUBSTRATES.has(tile.terrain) ||
          tile.ecosystem === 'grassland' ||
          tile.ecosystem === 'moss_field') &&
        tile.terrain !== 'mountain' &&
        tile.terrain !== 'desert' &&
        tile.soilFertility > 0.2
          ? 3
          : 0
      break
    default:
      base = 2
  }
  return Math.max(0, Math.round(base * Math.max(0.2, stress)))
}

function createNeutralGenome(): Genome {
  return {
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
}

export function habitatSuitability(kind: LifeKind, tile: Tile, genome: Genome): number {
  if (tile.terrain === 'void') return 0
  const habitat = effectiveHabitatTerrain(tile)
  const stress = environmentalStress(tile, genome)
  if (stress > 0.95) return 0

  switch (kind) {
    case 'ChemosyntheticMicrobe':
      if (tile.terrain === 'hydrothermal_vent') return 1 - stress
      if (tile.terrain === 'volcanic' || tile.terrain === 'deep_ocean') return (0.65 - stress) * genome.chemicalUse
      return 0
    case 'PhotosyntheticMicrobe':
      if (tile.terrain === 'deep_ocean' || tile.terrain === 'mountain') return 0
      return (tile.water * 0.5 + (1 - stress) * 0.5) * genome.lightUse
    case 'Algae':
      if ((!WATER_TERRAINS.has(tile.terrain) && tile.ecosystem !== 'algae_bloom') || tile.water < 0.3) return 0
      return (tile.water * 0.6 + (1 - stress) * 0.4) * genome.lightUse
    case 'PrimitivePlant':
      if (
        !LAND_SUBSTRATES.has(tile.terrain) &&
        habitat !== 'grassland' &&
        habitat !== 'forest' &&
        tile.ecosystem !== 'moss_field'
      ) {
        return 0
      }
      if (tile.terrain === 'desert') return 0
      return (tile.soilFertility * 0.55 + tile.water * 0.25 + (1 - stress) * 0.2) * genome.lightUse
    default:
      return Math.max(0, 0.5 - stress)
  }
}

export function isValidSpawnTile(kind: LifeKind, tile: Tile): boolean {
  return tileCarryingCapacity(kind, tile) > 0 && habitatSuitability(kind, tile, createNeutralGenome()) > 0.15
}

export function neighborOffsets(): Array<[number, number]> {
  return [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ]
}
