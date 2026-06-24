import type { AgentKind } from '../../types/agents'
import type { LifeKind } from '../../types/life'

export type PopulationUnitType = 'microbe' | 'bloom' | 'patch' | 'herd' | 'pack' | 'swarm' | 'settlement'

export interface PopulationScale {
  /** Typical individuals represented by one simulation unit. */
  individualsPerUnit: number
  /** Individuals added per aggregate reproduction / reserve birth event. */
  individualsPerBirth: number
  /** Max growth in represented individuals per tick per unit. */
  maxGrowthPerTick: number
  unitType: PopulationUnitType
  displayScaleLabel: string
}

export interface PopulationRepresentationPolicy extends PopulationScale {
  kind: LifeKind | AgentKind
  trophicRole: 'producer' | 'grazer' | 'predator' | 'scavenger'
  biomassPerIndividual: number
}

const PRODUCER_SCALES: Record<LifeKind, PopulationRepresentationPolicy> = {
  Microbe: {
    kind: 'Microbe',
    trophicRole: 'producer',
    individualsPerUnit: 1_000_000_000,
    individualsPerBirth: 10_000_000,
    maxGrowthPerTick: 50_000_000,
    unitType: 'microbe',
    displayScaleLabel: 'B',
    biomassPerIndividual: 0.000000001,
  },
  PhotosyntheticMicrobe: {
    kind: 'PhotosyntheticMicrobe',
    trophicRole: 'producer',
    individualsPerUnit: 500_000_000,
    individualsPerBirth: 5_000_000,
    maxGrowthPerTick: 25_000_000,
    unitType: 'microbe',
    displayScaleLabel: 'B',
    biomassPerIndividual: 0.000000002,
  },
  ChemosyntheticMicrobe: {
    kind: 'ChemosyntheticMicrobe',
    trophicRole: 'producer',
    individualsPerUnit: 500_000_000,
    individualsPerBirth: 5_000_000,
    maxGrowthPerTick: 25_000_000,
    unitType: 'microbe',
    displayScaleLabel: 'B',
    biomassPerIndividual: 0.000000002,
  },
  Algae: {
    kind: 'Algae',
    trophicRole: 'producer',
    individualsPerUnit: 10_000_000,
    individualsPerBirth: 100_000,
    maxGrowthPerTick: 500_000,
    unitType: 'bloom',
    displayScaleLabel: 'M',
    biomassPerIndividual: 0.00001,
  },
  PrimitivePlant: {
    kind: 'PrimitivePlant',
    trophicRole: 'producer',
    individualsPerUnit: 500,
    individualsPerBirth: 5,
    maxGrowthPerTick: 25,
    unitType: 'patch',
    displayScaleLabel: 'plants',
    biomassPerIndividual: 0.35,
  },
}

const MOBILE_SCALES: Record<AgentKind, PopulationRepresentationPolicy> = {
  SimpleGrazer: {
    kind: 'SimpleGrazer',
    trophicRole: 'grazer',
    individualsPerUnit: 200,
    individualsPerBirth: 2,
    maxGrowthPerTick: 8,
    unitType: 'herd',
    displayScaleLabel: 'herd',
    biomassPerIndividual: 0.55,
  },
  SimplePredator: {
    kind: 'SimplePredator',
    trophicRole: 'predator',
    individualsPerUnit: 20,
    individualsPerBirth: 1,
    maxGrowthPerTick: 3,
    unitType: 'pack',
    displayScaleLabel: 'pack',
    biomassPerIndividual: 0.55,
  },
  Scavenger: {
    kind: 'Scavenger',
    trophicRole: 'scavenger',
    individualsPerUnit: 500,
    individualsPerBirth: 5,
    maxGrowthPerTick: 15,
    unitType: 'swarm',
    displayScaleLabel: 'swarm',
    biomassPerIndividual: 0.55,
  },
}

/** Species/kind-specific representation scale — tiny organisms use huge per-unit counts. */
export function getRepresentationScale(kind: LifeKind | AgentKind): PopulationRepresentationPolicy {
  if (kind in PRODUCER_SCALES) {
    return PRODUCER_SCALES[kind as LifeKind]
  }
  return MOBILE_SCALES[kind as AgentKind]
}

/** Format estimated biological population for UI (K/M/B/T/Q). */
export function formatEstimatedPopulation(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e15) return `${(value / 1e15).toFixed(1)}Q`
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}

/** Compression ratio: estimated individuals / simulation unit count. */
export function representationCompressionRatio(
  estimatedIndividuals: number,
  unitCount: number,
): number {
  if (unitCount <= 0) return estimatedIndividuals > 0 ? estimatedIndividuals : 0
  return Math.round((estimatedIndividuals / unitCount) * 10) / 10
}
