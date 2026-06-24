import type { Genome, LifeKind } from '../../types/life'
import type { Tile } from '../../types/simulation'
import { isWaterTile } from '../world/worldStats'

export function lightAvailability(tile: Tile): number {
  if (tile.terrain === 'deep_ocean') return 0.08
  if (tile.terrain === 'ocean') return 0.45
  if (tile.terrain === 'hydrothermal_vent') return 0.05
  if (tile.terrain === 'coast' || tile.terrain === 'river') return 0.72
  if (tile.terrain === 'mountain' || tile.terrain === 'tundra') return 0.55
  return 0.85 - tile.elevation * 0.25
}

export function chemicalAvailability(tile: Tile): number {
  if (tile.terrain === 'hydrothermal_vent') return 0.95
  if (tile.terrain === 'volcanic') return 0.82
  if (tile.terrain === 'deep_ocean') return 0.35 + tile.resourceDeposits * 0.4
  if (tile.terrain === 'ocean') return 0.15
  return tile.resourceDeposits * 0.25
}

export function salinityStress(tile: Tile): number {
  if (tile.terrain === 'deep_ocean' || tile.terrain === 'ocean') return 0.85
  if (tile.terrain === 'coast') return 0.55
  if (tile.terrain === 'hydrothermal_vent') return 0.7
  return 0.1
}

export function temperatureStress(tile: Tile, genome: Genome): number {
  const optimal = 0.55
  const heatPenalty = Math.max(0, tile.temperature - optimal - (genome.heatTolerance - 0.5) * 0.35)
  const coldPenalty = Math.max(0, optimal - tile.temperature - (genome.coldTolerance - 0.5) * 0.35)
  return Math.min(1, heatPenalty * 1.6 + coldPenalty * 1.6)
}

export function waterStress(tile: Tile, genome: Genome): number {
  const need = 0.35 + (1 - genome.droughtResistance) * 0.35
  return Math.max(0, need - tile.water) * (1.2 - genome.waterTolerance * 0.4)
}

export function pressureStress(tile: Tile, genome: Genome): number {
  const pressure = tile.terrain === 'deep_ocean' || tile.terrain === 'hydrothermal_vent' ? 0.9 : tile.elevation * 0.2
  return Math.max(0, pressure - genome.pressureTolerance) * 1.4
}

export function environmentalStress(tile: Tile, genome: Genome): number {
  const salinity = Math.max(0, salinityStress(tile) - genome.salinityTolerance * 0.5)
  return Math.min(
    1,
    temperatureStress(tile, genome) +
      waterStress(tile, genome) +
      salinity * 0.35 +
      pressureStress(tile, genome),
  )
}

export function computeEnergyGain(
  kind: LifeKind,
  tile: Tile,
  genome: Genome,
): number {
  const stress = environmentalStress(tile, genome)
  if (stress > 0.92) return 0

  const light = lightAvailability(tile) * genome.lightUse
  const chemical = chemicalAvailability(tile) * genome.chemicalUse
  const fertilityBoost = tile.soilFertility * 0.15
  let gain = 0

  switch (kind) {
    case 'ChemosyntheticMicrobe':
      gain = chemical * 0.14 + (tile.terrain === 'hydrothermal_vent' ? 0.06 : 0)
      break
    case 'PhotosyntheticMicrobe':
      gain = light * tile.water * 0.12 + light * 0.04
      break
    case 'Algae':
      gain = light * tile.water * 0.13 + (isWaterTile(tile) ? 0.03 : 0)
      break
    case 'PrimitivePlant':
      gain = light * tile.soilFertility * 0.11 + fertilityBoost * genome.energyEfficiency
      break
    case 'Microbe':
      gain = (light * genome.lightUse + chemical * genome.chemicalUse) * 0.08
      break
  }

  return gain * genome.energyEfficiency * (1 - stress * 0.85)
}

export function computeMetabolismCost(genome: Genome): number {
  return 0.012 + (1 - genome.energyEfficiency) * 0.012
}
