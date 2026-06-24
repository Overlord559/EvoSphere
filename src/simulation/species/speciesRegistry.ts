import { nanoid } from 'nanoid'
import type { AgentKind } from '../../types/agents'
import type {
  EntityKind,
  Genome,
  SpeciesRecord,
  TaxonRank,
} from '../../types/life'
import type { TerrainType } from '../../types/simulation'
import { entityTrophicRole } from '../genetics/agentGenome'
import type { MobileGenome } from '../../types/agents'
import {
  DEFAULT_SPECIATION_CONFIG,
  type SpeciationConfig,
} from './speciationConfig'
import { SpeciesMemoryStore } from '../cognition/speciesMemoryStore'

let speciesCounter = 0

function formatSpeciesName(kind: EntityKind, index: number, rank: TaxonRank, isFounder = false): string {
  const base = kind.replace(/([A-Z])/g, ' $1').trim()
  if (isFounder) return `${base} (founder)`
  const suffix = rank === 'subspecies' ? ' subsp.' : rank === 'variant' ? ' var.' : ''
  return `${base}${suffix} ${index}`
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

function baseRecord(
  kind: EntityKind,
  tick: number,
  rank: TaxonRank,
  name: string,
  ancestorSpeciesId: string | null,
  parentSpeciesId: string | null,
  generation: number,
  isFounder: boolean,
): SpeciesRecord {
  return {
    id: nanoid(),
    name,
    kind,
    trophicRole: entityTrophicRole(kind),
    ancestorSpeciesId,
    parentSpeciesId,
    createdAtTick: tick,
    population: 0,
    totalBiomass: 0,
    generation,
    isFounderLineage: isFounder,
    preySpeciesIds: [],
    predatorSpeciesIds: [],
    isMobile: isMobileKind(kind),
    taxonRank: rank,
    establishmentYear: Math.floor(tick / 10),
    establishmentStatus: isFounder ? 'stable' : 'emerging',
    localFitnessScore: 0.5,
    adaptedTerrain: null,
    adaptedClimate: null,
    populationTrend: 'unknown',
    establishmentGraceTicks: rank === 'variant' ? DEFAULT_SPECIATION_CONFIG.variantGraceTicks : 0,
    speciesMemoryScore: 0,
  }
}

export class SpeciesRegistry {
  private readonly species = new Map<string, SpeciesRecord>()
  private readonly genomeBySpecies = new Map<string, Genome | MobileGenome>()
  private readonly founderSpeciesByKind = new Map<EntityKind, string>()
  private readonly config: SpeciationConfig
  readonly memoryStore: SpeciesMemoryStore

  constructor(config: SpeciationConfig = DEFAULT_SPECIATION_CONFIG) {
    this.config = config
    this.memoryStore = new SpeciesMemoryStore()
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
    const record = baseRecord(
      kind,
      tick,
      'species',
      formatSpeciesName(kind, speciesCounter, 'species', true),
      null,
      null,
      0,
      true,
    )
    this.species.set(record.id, record)
    this.genomeBySpecies.set(record.id, { ...genome })
    this.founderSpeciesByKind.set(kind, record.id)
    this.memoryStore.ensure(record.id)
    return record
  }

  registerBranch(
    kind: EntityKind,
    genome: Genome | MobileGenome,
    tick: number,
    ancestorSpeciesId: string,
    generation: number,
    options: {
      rank?: TaxonRank
      localFitnessScore?: number
      adaptedTerrain?: TerrainType | null
      reason?: string
    } = {},
  ): SpeciesRecord {
    speciesCounter += 1
    const rank = options.rank ?? 'variant'
    const record = baseRecord(
      kind,
      tick,
      rank,
      formatSpeciesName(kind, speciesCounter, rank),
      ancestorSpeciesId,
      ancestorSpeciesId,
      generation,
      false,
    )
    record.localFitnessScore = options.localFitnessScore ?? 0.5
    record.adaptedTerrain = options.adaptedTerrain ?? null
    record.adaptedClimate = options.reason ?? null
    record.establishmentGraceTicks =
      rank === 'variant' ? this.config.variantGraceTicks : rank === 'subspecies' ? this.config.subspeciesStabilizeTicks : 0
    this.species.set(record.id, record)
    this.genomeBySpecies.set(record.id, { ...genome })
    this.memoryStore.ensure(record.id)
    return record
  }

  promoteTaxon(speciesId: string, toRank: TaxonRank): SpeciesRecord | undefined {
    const record = this.species.get(speciesId)
    if (!record || record.taxonRank === toRank) return record
    if (toRank === 'species' && record.taxonRank === 'variant') {
      record.taxonRank = 'subspecies'
    }
    record.taxonRank = toRank
    record.establishmentStatus = 'stable'
    record.establishmentGraceTicks = 0
    record.name = record.name.replace(' var.', toRank === 'subspecies' ? ' subsp.' : '')
    return record
  }

  markFailed(speciesId: string): void {
    const record = this.species.get(speciesId)
    if (!record || record.isFounderLineage) return
    record.establishmentStatus = 'failed'
    record.populationTrend = 'declining'
  }

  tickEstablishment(tick: number): void {
    for (const record of this.species.values()) {
      if (record.establishmentStatus !== 'emerging') continue
      if (record.population <= 0 && tick - record.createdAtTick > 30) {
        record.establishmentStatus = 'failed'
        continue
      }
      if (record.establishmentGraceTicks > 0) {
        record.establishmentGraceTicks -= 1
      }
      if (
        record.population >= this.config.minPopulationForSubspecies &&
        tick - record.createdAtTick >= this.config.subspeciesStabilizeTicks &&
        record.taxonRank === 'variant'
      ) {
        this.promoteTaxon(record.id, 'subspecies')
      }
      if (
        record.population >= this.config.minPopulationForBranch &&
        tick - record.createdAtTick >= this.config.speciesStabilizeTicks &&
        record.taxonRank === 'subspecies'
      ) {
        this.promoteTaxon(record.id, 'species')
      }
      if (record.population >= this.config.minFounderGroupSize && record.establishmentStatus === 'emerging') {
        record.establishmentStatus = 'stable'
      }
    }
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
      if (record.kind !== kind || record.establishmentStatus === 'failed') continue
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
      const prevPop = record.population
      record.population = stats?.count ?? 0
      record.totalBiomass = stats?.biomass ?? 0
      if (record.population > prevPop + 1) record.populationTrend = 'growing'
      else if (record.population < prevPop - 1) record.populationTrend = 'declining'
      else if (record.population > 0) record.populationTrend = 'stable'
    }
  }

  getAll(): SpeciesRecord[] {
    return [...this.species.values()].sort((a, b) => b.population - a.population)
  }

  getStableSpecies(): SpeciesRecord[] {
    return this.getAll().filter(
      (s) => s.population > 0 && (s.taxonRank === 'species' || s.taxonRank === 'subspecies' || s.isFounderLineage),
    )
  }

  getVariants(): SpeciesRecord[] {
    return this.getAll().filter((s) => s.taxonRank === 'variant' && s.establishmentStatus !== 'failed')
  }

  getExtinct(): SpeciesRecord[] {
    return [...this.species.values()].filter(
      (s) => s.population === 0 && !s.isFounderLineage && s.establishmentStatus !== 'failed',
    )
  }

  getDominant(): SpeciesRecord | undefined {
    const alive = this.getAll().filter((s) => s.population > 0 && s.establishmentStatus !== 'failed')
    return alive[0]
  }

  getDominantByRole(role: SpeciesRecord['trophicRole']): SpeciesRecord | undefined {
    return this.getAll().find((s) => s.population > 0 && s.trophicRole === role)
  }

  clear(): void {
    this.species.clear()
    this.genomeBySpecies.clear()
    this.founderSpeciesByKind.clear()
    this.memoryStore.clear()
  }
}

export function resetSpeciesCounter(): void {
  speciesCounter = 0
}

export { DEFAULT_SPECIATION_CONFIG }
