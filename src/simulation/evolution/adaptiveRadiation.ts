import type { EntityKind, Genome } from '../../types/life'
import type { MobileGenome } from '../../types/agents'
import type { Tile } from '../../types/simulation'
import { effectiveHabitatTerrain } from '../world/terrainHelpers'
import { geneticDistance } from '../species/speciesRegistry'
import type { SpeciationConfig } from '../species/speciationConfig'
import { tickToYears } from '../engine/simTime'

export type TaxonRank = 'variant' | 'subspecies' | 'species'

export interface BranchCandidate {
  shouldBranch: boolean
  rank: TaxonRank
  localFitnessScore: number
  adaptedTerrain: import('../../types/simulation').TerrainType | null
  reason: string
}

export function computeLocalFitness(
  parentGenome: Genome | MobileGenome,
  childGenome: Genome | MobileGenome,
  tile: Tile,
): number {
  const habitat = effectiveHabitatTerrain(tile)
  let score = 0.5

  const tempStress = Math.abs(tile.temperature - 0.55)
  const coldBonus = (childGenome.coldTolerance - parentGenome.coldTolerance) * (tile.temperature < 0.35 ? 2 : 0.5)
  const heatBonus = (childGenome.heatTolerance - parentGenome.heatTolerance) * (tile.temperature > 0.7 ? 2 : 0.5)
  const waterBonus = (childGenome.waterTolerance - parentGenome.waterTolerance) * tile.water
  const droughtBonus =
    (childGenome.droughtResistance - parentGenome.droughtResistance) * (tile.moisture < 0.25 ? 1.5 : 0.3)

  score += coldBonus + heatBonus + waterBonus + droughtBonus - tempStress * 0.1

  if (habitat === 'swamp' || habitat === 'marsh') {
    score += childGenome.waterTolerance * 0.15
  }
  if (habitat === 'mountain' || habitat === 'snow' || habitat === 'tundra') {
    score += childGenome.coldTolerance * 0.12
  }
  if (habitat === 'desert' || habitat === 'sand') {
    score += childGenome.droughtResistance * 0.15
  }

  return Math.max(0, Math.min(1.5, score))
}

export function evaluateBranchCandidate(
  parentGenome: Genome | MobileGenome,
  childGenome: Genome | MobileGenome,
  tile: Tile,
  childGeneration: number,
  parentPopulation: number,
  config: SpeciationConfig,
  establishmentTicks: number,
  childPopulation: number,
): BranchCandidate {
  const distance = geneticDistance(parentGenome, childGenome)
  const localFitness = computeLocalFitness(parentGenome, childGenome, tile)
  const habitat = effectiveHabitatTerrain(tile)
  const fitnessAdvantage = localFitness - 0.5

  if (childGeneration < config.minGenerationsBeforeVariant) {
    return { shouldBranch: false, rank: 'variant', localFitnessScore: localFitness, adaptedTerrain: habitat, reason: 'too young' }
  }
  if (parentPopulation < config.minPopulationForVariant) {
    return { shouldBranch: false, rank: 'variant', localFitnessScore: localFitness, adaptedTerrain: habitat, reason: 'parent pop low' }
  }
  if (distance < config.geneticDistanceVariantThreshold) {
    return { shouldBranch: false, rank: 'variant', localFitnessScore: localFitness, adaptedTerrain: habitat, reason: 'too similar' }
  }

  const minFounders = config.minFounderGroupSize
  if (childPopulation < minFounders && establishmentTicks < config.variantGraceTicks) {
    return {
      shouldBranch: distance > config.geneticDistanceVariantThreshold * 0.8,
      rank: 'variant',
      localFitnessScore: localFitness,
      adaptedTerrain: habitat,
      reason: 'emerging variant',
    }
  }

  if (fitnessAdvantage < config.minLocalFitnessAdvantage && distance < config.geneticDistanceThreshold) {
    return { shouldBranch: false, rank: 'variant', localFitnessScore: localFitness, adaptedTerrain: habitat, reason: 'no local advantage' }
  }

  let rank: TaxonRank = 'variant'
  if (
    establishmentTicks >= config.subspeciesStabilizeTicks &&
    childPopulation >= config.minPopulationForSubspecies &&
    (fitnessAdvantage >= config.minLocalFitnessAdvantage || distance > config.geneticDistanceThreshold * 0.85)
  ) {
    rank = 'subspecies'
  }
  if (
    establishmentTicks >= config.speciesStabilizeTicks &&
    childPopulation >= config.minPopulationForBranch &&
    distance > config.geneticDistanceThreshold &&
    fitnessAdvantage >= config.minLocalFitnessAdvantage * 0.8
  ) {
    rank = 'species'
  }

  const shouldBranch =
    distance > config.geneticDistanceVariantThreshold &&
    (fitnessAdvantage >= config.minLocalFitnessAdvantage * 0.5 || distance > config.geneticDistanceThreshold)

  let reason = 'local adaptation'
  if (tile.temperature < 0.3) reason = 'cold-tolerant local adaptation'
  else if (habitat === 'marsh' || habitat === 'swamp') reason = 'wetland-adapted ecotype'
  else if (habitat === 'grassland' || habitat === 'forest') reason = 'dense-cover habitat specialization'
  else if (tile.terrain === 'hydrothermal_vent') reason = 'vent microbe variant'

  return { shouldBranch, rank, localFitnessScore: localFitness, adaptedTerrain: habitat, reason }
}

export function adaptiveRadiationMessage(
  rank: TaxonRank,
  kind: EntityKind,
  reason: string,
  tick: number,
): string {
  const yr = tickToYears(tick)
  switch (rank) {
    case 'subspecies':
      return `Adaptive radiation — ${reason} produced a ${kind} subspecies (yr ${yr}).`
    case 'species':
      return `${kind} species stabilized after ${reason} (yr ${yr}).`
    default:
      return `${kind} variant emerging: ${reason}.`
  }
}

export function promotionEventMessage(
  to: TaxonRank,
  name: string,
  reason: string,
): string {
  if (to === 'subspecies') return `${name} promoted to subspecies — ${reason}.`
  if (to === 'species') return `${name} stabilized as species — ${reason}.`
  return `${name} ecotype emerged — ${reason}.`
}
