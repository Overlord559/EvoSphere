import type { MobileAgent } from '../../types/agents'
import type { Tile } from '../../types/simulation'

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export interface FitnessResult {
  score: number
  movementCostMultiplier: number
  energyGainMultiplier: number
  reproductionMultiplier: number
  healthStress: number
  migrationPressure: number
  extinctionRisk: number
  habitatLabel: string
}

const TERRAIN_AQUATIC = new Set(['ocean', 'deep_ocean', 'coast', 'river', 'swamp'])
const TERRAIN_DRY = new Set(['desert', 'mountain', 'tundra'])

function terrainHabitatLabel(terrain: Tile['terrain']): string {
  if (TERRAIN_AQUATIC.has(terrain)) return 'aquatic'
  if (TERRAIN_DRY.has(terrain)) return 'arid/cold'
  if (terrain === 'forest') return 'forest'
  if (terrain === 'grassland') return 'grassland'
  if (terrain === 'hydrothermal_vent') return 'vent'
  if (terrain === 'volcanic') return 'volcanic'
  return terrain.replace(/_/g, ' ')
}

/** Per-tile environmental fitness for a mobile agent. */
export function computeTileFitness(
  agent: MobileAgent,
  tile: Tile,
  tileBiomass: number,
  predatorPressure: number,
): number {
  const g = agent.genome
  const bp = agent.bodyPlan

  let score = 0.5

  const tempFit = 1 - Math.abs(tile.temperature - (0.45 + g.heatTolerance * 0.1 - (1 - g.coldTolerance) * 0.1))
  score += tempFit * 0.2

  const moistureFit = TERRAIN_DRY.has(tile.terrain)
    ? g.droughtResistance * 0.25
    : tile.moisture * g.waterTolerance * 0.2
  score += moistureFit

  if (TERRAIN_AQUATIC.has(tile.terrain)) {
    score += bp.aquaticAdaptation * 0.25 + g.waterTolerance * 0.15
    score -= bp.terrestrialAdaptation * 0.1
  } else {
    score += bp.terrestrialAdaptation * 0.2 + g.terrainPreference * 0.1
    score -= bp.aquaticAdaptation * 0.08
  }

  if (tile.terrain === 'hydrothermal_vent') {
    score += g.chemicalUse * 0.15 + g.pressureTolerance * 0.1
  }

  score += Math.min(0.2, tileBiomass * 0.08 * g.grazingEfficiency)
  score -= predatorPressure * g.fearfulness * 0.15
  score += tile.soilFertility * 0.08

  return clamp01(score)
}

export function computeAgentFitness(
  agent: MobileAgent,
  tile: Tile,
  tileBiomass: number,
  tileAgentCount: number,
  predatorPressure: number,
): FitnessResult {
  const g = agent.genome
  const bp = agent.bodyPlan
  const baseScore = computeTileFitness(agent, tile, tileBiomass, predatorPressure)

  let movementCostMultiplier = 1
  if (TERRAIN_DRY.has(tile.terrain)) {
    movementCostMultiplier += (1 - g.droughtResistance) * 0.35
  }
  if (tile.terrain === 'mountain') {
    movementCostMultiplier += (1 - bp.climbingAdaptation) * 0.25
  }
  if (TERRAIN_AQUATIC.has(tile.terrain) && bp.locomotionType !== 'fins') {
    movementCostMultiplier += (1 - bp.aquaticAdaptation) * 0.3
  }
  if (bp.locomotionType === 'crawling') movementCostMultiplier *= 0.92
  if (bp.locomotionType === 'hopping') movementCostMultiplier *= 1.08

  const energyGainMultiplier = clamp01(
    0.85 + baseScore * 0.25 + g.energyEfficiency * 0.15,
  )
  const reproductionMultiplier = clamp01(
    0.7 + baseScore * 0.35 + g.reproductionRate * 0.2 - agent.habitatStress * 0.2,
  )

  const crowding = tileAgentCount >= 2 ? 0.15 * tileAgentCount : 0
  const healthStress = clamp01(
    (1 - baseScore) * 0.4 + crowding + (agent.hunger > 0.7 ? 0.2 : 0) + predatorPressure * 0.1,
  )
  const migrationPressure = clamp01(
    (1 - baseScore) * 0.5 + predatorPressure * g.fearfulness * 0.3 + (tileBiomass < 0.15 ? 0.25 : 0),
  )
  const extinctionRisk = clamp01(
    healthStress * 0.4 + (agent.energy < 0.2 ? 0.3 : 0) + agent.habitatStress * 0.15,
  )

  return {
    score: baseScore,
    movementCostMultiplier,
    energyGainMultiplier,
    reproductionMultiplier,
    healthStress,
    migrationPressure,
    extinctionRisk,
    habitatLabel: terrainHabitatLabel(tile.terrain),
  }
}

export function preferredTerrainForAgent(agent: MobileAgent): string {
  const bp = agent.bodyPlan
  if (bp.aquaticAdaptation > 0.65) return 'coast/swamp'
  if (bp.terrestrialAdaptation > 0.7 && agent.genome.droughtResistance > 0.55) return 'grassland/desert edge'
  if (agent.genome.coldTolerance > 0.6) return 'tundra'
  if (agent.genome.waterTolerance > 0.65) return 'wetland'
  return 'generalist'
}
