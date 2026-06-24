import { nanoid } from 'nanoid'
import type { EnergySource, LifeKind, LifeOrganism } from '../../types/life'
import { createBaseGenome } from '../genetics/genome'
import type { Genome } from '../../types/life'

function energySourceForKind(kind: LifeKind): EnergySource {
  switch (kind) {
    case 'ChemosyntheticMicrobe':
      return 'chemosynthesis'
    case 'PhotosyntheticMicrobe':
    case 'Algae':
    case 'PrimitivePlant':
      return 'photosynthesis'
    default:
      return 'mixed'
  }
}

function baseBiomass(kind: LifeKind): number {
  switch (kind) {
    case 'PrimitivePlant':
      return 1.4
    case 'Algae':
      return 0.9
    case 'PhotosyntheticMicrobe':
    case 'ChemosyntheticMicrobe':
      return 0.35
    default:
      return 0.4
  }
}

export function createOrganism(
  kind: LifeKind,
  speciesId: string,
  x: number,
  y: number,
  genome: Genome,
  generation = 0,
): LifeOrganism {
  const maxAge = Math.round(genome.lifespan * (0.85 + generation * 0.02))
  return {
    id: nanoid(),
    speciesId,
    kind,
    x,
    y,
    energy: 0.45 + genome.energyEfficiency * 0.15,
    health: 1,
    age: 0,
    maxAge,
    reproductionCooldown: Math.round(12 / Math.max(0.15, genome.reproductionRate)),
    genome: { ...genome },
    energySource: energySourceForKind(kind),
    generation,
    biomass: baseBiomass(kind) * (0.8 + genome.energyEfficiency * 0.4),
  }
}

export function createFounderOrganism(
  kind: LifeKind,
  speciesId: string,
  x: number,
  y: number,
): LifeOrganism {
  const genome = createBaseGenome(kind)
  return createOrganism(kind, speciesId, x, y, genome, 0)
}

export { createBaseGenome }
