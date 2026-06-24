import { nanoid } from 'nanoid'
import type { Genome, LifeKind, SpeciesRecord } from '../../types/life'

let speciesCounter = 0

function formatSpeciesName(kind: LifeKind, index: number): string {
  const base = kind.replace(/([A-Z])/g, ' $1').trim()
  return `${base} ${index}`
}

export class SpeciesRegistry {
  private readonly species = new Map<string, SpeciesRecord>()
  private readonly genomeBySpecies = new Map<string, Genome>()

  register(
    kind: LifeKind,
    genome: Genome,
    tick: number,
    ancestorSpeciesId: string | null = null,
    generation = 0,
  ): SpeciesRecord {
    speciesCounter += 1
    const id = nanoid()
    const record: SpeciesRecord = {
      id,
      name: formatSpeciesName(kind, speciesCounter),
      kind,
      ancestorSpeciesId,
      createdAtTick: tick,
      population: 0,
      totalBiomass: 0,
      generation,
    }
    this.species.set(id, record)
    this.genomeBySpecies.set(id, { ...genome })
    return record
  }

  get(id: string): SpeciesRecord | undefined {
    return this.species.get(id)
  }

  getGenome(id: string): Genome | undefined {
    return this.genomeBySpecies.get(id)
  }

  findByGenome(kind: LifeKind, genome: Genome): SpeciesRecord | undefined {
    for (const record of this.species.values()) {
      if (record.kind !== kind) continue
      const stored = this.genomeBySpecies.get(record.id)
      if (!stored) continue
      if (genomesMatch(stored, genome)) return record
    }
    return undefined
  }

  updateCounts(populations: Map<string, { count: number; biomass: number }>): void {
    for (const record of this.species.values()) {
      const stats = populations.get(record.id)
      record.population = stats?.count ?? 0
      record.totalBiomass = stats?.biomass ?? 0
    }
  }

  getAll(): SpeciesRecord[] {
    return [...this.species.values()].sort((a, b) => b.population - a.population)
  }

  clear(): void {
    this.species.clear()
    this.genomeBySpecies.clear()
  }
}

function genomesMatch(a: Genome, b: Genome, epsilon = 0.025): boolean {
  const keys = Object.keys(a) as (keyof Genome)[]
  for (const key of keys) {
    if (Math.abs(a[key] - b[key]) > epsilon) return false
  }
  return true
}

export function resetSpeciesCounter(): void {
  speciesCounter = 0
}
