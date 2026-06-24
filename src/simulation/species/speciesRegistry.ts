import { nanoid } from 'nanoid'
import type { AgentKind } from '../../types/agents'
import type { EntityKind, Genome, SpeciesRecord } from '../../types/life'
import { entityTrophicRole } from '../genetics/agentGenome'
import type { MobileGenome } from '../../types/agents'
import {
  DEFAULT_SPECIATION_CONFIG,
  type SpeciationConfig,
} from './speciationConfig'

let speciesCounter = 0

function formatSpeciesName(kind: EntityKind, index: number, isFounder = false): string {
  const base = kind.replace(/([A-Z])/g, ' $1').trim()
  return isFounder ? `${base} (founder)` : `${base} ${index}`
}

export function geneticDistance(a: Genome | MobileGenome, b: Genome | MobileGenome): number {
  const keys = Object.keys(a) as (keyof Genome)[]
  let delta = 0
  for (const key of keys) {
    const av = a[key as keyof typeof a] as number
    const bv = b[key as keyof typeof b] as number
    if (typeof av === 'number' && typeof bv === 'number') {
      delta += Math.abs(av - bv)
    }
  }
  return delta / keys.length
}

export function genomesMatch(a: Genome | MobileGenome, b: Genome | MobileGenome, epsilon = 0.04): boolean {
  return geneticDistance(a, b) <= epsilon
}

function isMobileKind(kind: EntityKind): kind is AgentKind {
  return kind === 'SimpleGrazer' || kind === 'SimplePredator' || kind === 'Scavenger'
}

export class SpeciesRegistry {
  private readonly species = new Map<string, SpeciesRecord>()
  private readonly genomeBySpecies = new Map<string, Genome | MobileGenome>()
  private readonly founderSpeciesByKind = new Map<EntityKind, string>()
  private readonly config: SpeciationConfig

  constructor(config: SpeciationConfig = DEFAULT_SPECIATION_CONFIG) {
    this.config = config
  }

  getOrCreateFounderSpecies(
    kind: EntityKind,
    genome: Genome | MobileGenome,
    tick: number,
  ): SpeciesRecord {
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
      trophicRole: entityTrophicRole(kind),
      ancestorSpeciesId: null,
      createdAtTick: tick,
      population: 0,
      totalBiomass: 0,
      generation: 0,
      isFounderLineage: true,
      preySpeciesIds: [],
      predatorSpeciesIds: [],
      isMobile: isMobileKind(kind),
    }
    this.species.set(id, record)
    this.genomeBySpecies.set(id, { ...genome })
    this.founderSpeciesByKind.set(kind, id)
    return record
  }

  registerBranch(
    kind: EntityKind,
    genome: Genome | MobileGenome,
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
      trophicRole: entityTrophicRole(kind),
      ancestorSpeciesId,
      createdAtTick: tick,
      population: 0,
      totalBiomass: 0,
      generation,
      isFounderLineage: false,
      preySpeciesIds: [],
      predatorSpeciesIds: [],
      isMobile: isMobileKind(kind),
    }
    this.species.set(id, record)
    this.genomeBySpecies.set(id, { ...genome })
    return record
  }

  get(id: string): SpeciesRecord | undefined {
    return this.species.get(id)
  }

  getGenome(id: string): Genome | MobileGenome | undefined {
    return this.genomeBySpecies.get(id)
  }

  getConfig(): SpeciationConfig {
    return this.config
  }

  getPopulation(speciesId: string): number {
    return this.species.get(speciesId)?.population ?? 0
  }

  findByGenome(
    kind: EntityKind,
    genome: Genome | MobileGenome,
    maxDistance = 0.04,
  ): SpeciesRecord | undefined {
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

  getDominantByRole(role: SpeciesRecord['trophicRole']): SpeciesRecord | undefined {
    return this.getAll().find((s) => s.population > 0 && s.trophicRole === role)
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
