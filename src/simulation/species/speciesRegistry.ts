import { nanoid } from 'nanoid'
import type { Genome, LifeKind, SpeciesRecord } from '../../types/life'
import {
  DEFAULT_SPECIATION_CONFIG,
  type SpeciationConfig,
} from './speciationConfig'

let speciesCounter = 0

function formatSpeciesName(kind: LifeKind, index: number, isFounder = false): string {
  const base = kind.replace(/([A-Z])/g, ' $1').trim()
  return isFounder ? `${base} (founder)` : `${base} ${index}`
}

export function geneticDistance(a: Genome, b: Genome): number {
  const keys = Object.keys(a) as (keyof Genome)[]
  let delta = 0
  for (const key of keys) {
    delta += Math.abs(a[key] - b[key])
  }
  return delta / keys.length
}

export function genomesMatch(a: Genome, b: Genome, epsilon = 0.04): boolean {
  return geneticDistance(a, b) <= epsilon
}

export class SpeciesRegistry {
  private readonly species = new Map<string, SpeciesRecord>()
  private readonly genomeBySpecies = new Map<string, Genome>()
  private readonly founderSpeciesByKind = new Map<LifeKind, string>()
  private readonly config: SpeciationConfig

  constructor(config: SpeciationConfig = DEFAULT_SPECIATION_CONFIG) {
    this.config = config
  }

  /** Shared founder lineage per archetype — one species per LifeKind at seed time. */
  getOrCreateFounderSpecies(kind: LifeKind, genome: Genome, tick: number): SpeciesRecord {
    const existingId = this.founderSpeciesByKind.get(kind)
    if (existingId) {
      const existing = this.species.get(existingId)
      if (existing) return existing
    }

    speciesCounter += 1
    const id = nanoid()
    const record: SpeciesRecord = {
      id,
      name: formatSpeciesName(kind, speciesCounter, true),
      kind,
      ancestorSpeciesId: null,
      createdAtTick: tick,
      population: 0,
      totalBiomass: 0,
      generation: 0,
      isFounderLineage: true,
    }
    this.species.set(id, record)
    this.genomeBySpecies.set(id, { ...genome })
    this.founderSpeciesByKind.set(kind, id)
    return record
  }

  registerBranch(
    kind: LifeKind,
    genome: Genome,
    tick: number,
    ancestorSpeciesId: string,
    generation: number,
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
      isFounderLineage: false,
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

  getConfig(): SpeciationConfig {
    return this.config
  }

  getPopulation(speciesId: string): number {
    return this.species.get(speciesId)?.population ?? 0
  }

  /** Find an existing species of the same kind within genetic tolerance. */
  findByGenome(kind: LifeKind, genome: Genome, maxDistance = 0.04): SpeciesRecord | undefined {
    let best: SpeciesRecord | undefined
    let bestDistance = maxDistance

    for (const record of this.species.values()) {
      if (record.kind !== kind) continue
      const stored = this.genomeBySpecies.get(record.id)
      if (!stored) continue
      const distance = geneticDistance(stored, genome)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = record
      }
    }
    return best
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

  getExtinct(): SpeciesRecord[] {
    return [...this.species.values()].filter(
      (s) => s.population === 0 && !s.isFounderLineage,
    )
  }

  getDominant(): SpeciesRecord | undefined {
    const alive = this.getAll().filter((s) => s.population > 0)
    return alive[0]
  }

  clear(): void {
    this.species.clear()
    this.genomeBySpecies.clear()
    this.founderSpeciesByKind.clear()
  }
}

export function resetSpeciesCounter(): void {
  speciesCounter = 0
}

export { DEFAULT_SPECIATION_CONFIG }
