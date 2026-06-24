/** Configurable thresholds for when reproduction may branch a new species. */
export interface SpeciationConfig {
  minGenerationsBeforeSpeciation: number
  geneticDistanceThreshold: number
  minPopulationForBranch: number
}

export const DEFAULT_SPECIATION_CONFIG: SpeciationConfig = {
  minGenerationsBeforeSpeciation: 8,
  geneticDistanceThreshold: 0.18,
  minPopulationForBranch: 12,
}
