import type { Genome, LifeKind } from '../../types/life'

export function createBaseGenome(kind: LifeKind): Genome {
  switch (kind) {
    case 'ChemosyntheticMicrobe':
      return {
        reproductionRate: 0.35,
        mutationRate: 0.04,
        energyEfficiency: 0.72,
        heatTolerance: 0.85,
        coldTolerance: 0.55,
        waterTolerance: 0.95,
        salinityTolerance: 0.8,
        lightUse: 0.05,
        chemicalUse: 0.9,
        spreadRate: 0.25,
        lifespan: 180,
        droughtResistance: 0.4,
        pressureTolerance: 0.95,
      }
    case 'PhotosyntheticMicrobe':
      return {
        reproductionRate: 0.42,
        mutationRate: 0.05,
        energyEfficiency: 0.68,
        heatTolerance: 0.6,
        coldTolerance: 0.45,
        waterTolerance: 0.85,
        salinityTolerance: 0.55,
        lightUse: 0.88,
        chemicalUse: 0.1,
        spreadRate: 0.38,
        lifespan: 140,
        droughtResistance: 0.35,
        pressureTolerance: 0.35,
      }
    case 'Algae':
      return {
        reproductionRate: 0.38,
        mutationRate: 0.045,
        energyEfficiency: 0.74,
        heatTolerance: 0.55,
        coldTolerance: 0.4,
        waterTolerance: 0.95,
        salinityTolerance: 0.65,
        lightUse: 0.92,
        chemicalUse: 0.08,
        spreadRate: 0.32,
        lifespan: 200,
        droughtResistance: 0.25,
        pressureTolerance: 0.4,
      }
    case 'PrimitivePlant':
      return {
        reproductionRate: 0.28,
        mutationRate: 0.035,
        energyEfficiency: 0.62,
        heatTolerance: 0.5,
        coldTolerance: 0.35,
        waterTolerance: 0.7,
        salinityTolerance: 0.25,
        lightUse: 0.85,
        chemicalUse: 0.05,
        spreadRate: 0.22,
        lifespan: 420,
        droughtResistance: 0.55,
        pressureTolerance: 0.15,
      }
    case 'Microbe':
    default:
      return {
        reproductionRate: 0.4,
        mutationRate: 0.05,
        energyEfficiency: 0.6,
        heatTolerance: 0.5,
        coldTolerance: 0.5,
        waterTolerance: 0.6,
        salinityTolerance: 0.5,
        lightUse: 0.4,
        chemicalUse: 0.4,
        spreadRate: 0.3,
        lifespan: 120,
        droughtResistance: 0.4,
        pressureTolerance: 0.5,
      }
  }
}

export function cloneGenome(genome: Genome): Genome {
  return { ...genome }
}

export function genomesDiverged(a: Genome, b: Genome, threshold = 0.12): boolean {
  const keys = Object.keys(a) as (keyof Genome)[]
  let delta = 0
  for (const key of keys) {
    delta += Math.abs(a[key] - b[key])
  }
  return delta / keys.length > threshold
}
