/** Configurable thresholds for variant → subspecies → species pipeline. */
export interface SpeciationConfig {
  minGenerationsBeforeVariant: number
  minGenerationsBeforeSpeciation: number
  geneticDistanceVariantThreshold: number
  geneticDistanceThreshold: number
  minPopulationForVariant: number
  minPopulationForSubspecies: number
  minPopulationForBranch: number
  minLocalFitnessAdvantage: number
  minFounderGroupSize: number
  variantGraceTicks: number
  subspeciesStabilizeTicks: number
  speciesStabilizeTicks: number
}

export const DEFAULT_SPECIATION_CONFIG: SpeciationConfig = {
  minGenerationsBeforeVariant: 6,
  minGenerationsBeforeSpeciation: 10,
  geneticDistanceVariantThreshold: 0.1,
  geneticDistanceThreshold: 0.2,
  minPopulationForVariant: 8,
  minPopulationForSubspecies: 10,
  minPopulationForBranch: 16,
  minLocalFitnessAdvantage: 0.08,
  minFounderGroupSize: 3,
  variantGraceTicks: 120,
  subspeciesStabilizeTicks: 200,
  speciesStabilizeTicks: 400,
}

/** @deprecated use DEFAULT_SPECIATION_CONFIG */
export const LEGACY_SPECIATION = DEFAULT_SPECIATION_CONFIG
