import type { MobileGenome } from '../../types/agents'
import type { Genome } from '../../types/life'
import type { Rng } from '../../utils/rng'
import { randomFloat } from '../../utils/rng'
import { geneticDistance } from '../species/speciesRegistry'
import {
  DEFAULT_SPECIATION_CONFIG,
  type SpeciationConfig,
} from '../species/speciationConfig'
import { cloneGenome } from './genome'
import { cloneMobileGenome } from './agentGenome'

const GENOME_KEYS: (keyof Genome)[] = [
  'reproductionRate',
  'mutationRate',
  'energyEfficiency',
  'heatTolerance',
  'coldTolerance',
  'waterTolerance',
  'salinityTolerance',
  'lightUse',
  'chemicalUse',
  'spreadRate',
  'lifespan',
  'droughtResistance',
  'pressureTolerance',
]

const MOBILE_GENOME_KEYS: (keyof MobileGenome)[] = [
  ...GENOME_KEYS,
  'speed',
  'stamina',
  'metabolism',
  'sensoryRange',
  'grazingEfficiency',
  'huntingEfficiency',
  'digestionEfficiency',
  'terrainPreference',
  'aggression',
  'fearfulness',
]

function clamp01(value: number): number {
  return Math.max(0.05, Math.min(0.98, value))
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Deterministic offspring genome with bounded mutation. */
export function mutateGenome(parent: Genome, rng: Rng): Genome {
  const child = cloneGenome(parent)
  if (rng() > parent.mutationRate) return child

  const mutations = Math.max(1, Math.floor(rng() * 3))
  for (let i = 0; i < mutations; i++) {
    const key = GENOME_KEYS[Math.floor(rng() * GENOME_KEYS.length)]
    const delta = randomFloat(rng, -0.08, 0.08)
    child[key] = clamp01(child[key] + delta)
  }

  child.mutationRate = clamp01(parent.mutationRate + randomFloat(rng, -0.01, 0.015))
  return child
}

export function mutateMobileGenome(parent: MobileGenome, rng: Rng): MobileGenome {
  const child = cloneMobileGenome(parent)
  if (rng() > parent.mutationRate) return child

  const mutations = Math.max(1, Math.floor(rng() * 3))
  for (let i = 0; i < mutations; i++) {
    const key = MOBILE_GENOME_KEYS[Math.floor(rng() * MOBILE_GENOME_KEYS.length)]
    const delta = randomFloat(rng, -0.08, 0.08)
    if (key === 'sensoryRange') {
      child.sensoryRange = clampRange(child.sensoryRange + delta * 5, 1, 5)
    } else {
      child[key] = clamp01(child[key] + delta)
    }
  }

  child.mutationRate = clamp01(parent.mutationRate + randomFloat(rng, -0.01, 0.015))
  return child
}

export function shouldSpeciate(
  parent: Genome,
  child: Genome,
  childGeneration: number,
  parentSpeciesPopulation: number,
  config: SpeciationConfig = DEFAULT_SPECIATION_CONFIG,
): boolean {
  if (childGeneration < config.minGenerationsBeforeSpeciation) return false
  if (parentSpeciesPopulation < config.minPopulationForBranch) return false
  return geneticDistance(parent, child) > config.geneticDistanceThreshold
}

export function shouldSpeciateMobile(
  parent: MobileGenome,
  child: MobileGenome,
  childGeneration: number,
  parentSpeciesPopulation: number,
  config: SpeciationConfig = DEFAULT_SPECIATION_CONFIG,
): boolean {
  if (childGeneration < config.minGenerationsBeforeSpeciation) return false
  if (parentSpeciesPopulation < config.minPopulationForBranch) return false
  return geneticDistance(parent, child) > config.geneticDistanceThreshold + 0.02
}
