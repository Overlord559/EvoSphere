import type {
  LifeKind,
  LifeOrganism,
  LifeSnapshot,
  PopulationArchitectureMetrics,
  TileLifeData,
} from '../../types/life'
import {
  MAX_ORGANISMS_PER_TILE,
  BASE_METABOLISM,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
} from '../../types/life'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { forkRng } from '../../utils/rng'
import { PopulationUnitStore } from '../ecology/populationUnits'
import {
  getTileCarryingCapacity,
  getWorldCarryingCapacityByTrophicRole,
  getExpansionPressure,
  type CarryingCapacityContext,
} from '../ecology/carryingCapacity'
import { habitatSuitability, neighborOffsets } from '../ecology/colonization'
import {
  buildPopulationConfig,
  type PopulationArchitectureConfig,
} from '../ecology/populationConfig'
import {
  computeEnergyGain,
  computeMetabolismCost,
  environmentalStress,
} from '../ecology/energy'
import { mutateGenome } from '../genetics/mutation'
import { adaptiveRadiationMessage, evaluateBranchCandidate } from '../evolution/adaptiveRadiation'
import type { RecoveryModifiers } from '../evolution/bottleneckRecovery'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'
import {
  clampOrganismVitals,
  sanitizeOrganism,
  MAX_BIRTHS_PER_TICK,
  MAX_SPECIES_POP_HISTORY,
} from '../engine/stabilityGuards'
import { createFounderOrganism, createOrganism } from './createLife'
import { SpeciesRegistry, resetSpeciesCounter } from '../species/speciesRegistry'
import { buildSpeciesOccupancy } from '../species/speciesOccupancy'
import { DEFAULT_SPECIATION_CONFIG } from '../species/speciationConfig'

export type LifeEventEmitter = (type: string, message: string) => void

const NOOP_EMIT: LifeEventEmitter = () => {}

const BLOOM_THRESHOLD = 40
const DIE_OFF_THRESHOLD = 20
const BIOMASS_SWING_RATIO = 0.35

export class LifeSystem {
  private organisms: LifeOrganism[] = []
  private readonly registry = new SpeciesRegistry()
  private tileCounts: number[] = []
  private tileBiomass: number[] = []
  private liveTileCounts: number[] = []
  private speciesOccupancyCache: LifeSnapshot['speciesOccupancy'] = {}
  private cachedTotalBiomass = 0
  private readonly seed: string
  private tickRng: Rng
  private lastPopulation = 0
  private lastBiomass = 0
  private lastDominantSpeciesId: string | null = null
  private firstReproductionLogged = false
  private colonizedTiles = new Set<number>()
  private speciesPopHistory = new Map<string, number>()
  private bloomCooldown = 0
  private dieOffCooldown = 0
  private recentActivityTiles = new Set<number>()
  private lastTickBirths = 0
  private lastTickDeaths = 0
  private readonly aggregate = new PopulationUnitStore()
  private popConfig: PopulationArchitectureConfig | null = null
  private capacityPressureCooldown = 0
  private lastBottleneckKind: import('../evolution/bottleneckRecovery').BottleneckKind = 'none'
  private recoveryMods: RecoveryModifiers = {
    reproductionBoost: 1,
    dispersalBoost: 1,
    mutationVarianceBoost: 1,
    overcrowdingRelief: 1,
  }

  constructor(seed: string, world: World) {
    this.seed = seed
    this.tickRng = forkRng(seed, 'life')
    this.popConfig = buildPopulationConfig(world)
    this.aggregate.init(world)
    this.initTileArrays(world)
    resetSpeciesCounter()
    this.registry.clear()
  }

  getAggregateStore(): PopulationUnitStore {
    return this.aggregate
  }

  getPopulationConfig(): PopulationArchitectureConfig {
    if (this.popConfig) return this.popConfig
    return {
      maxTrackedIndividuals: 4000,
      maxTrackedAgents: 600,
      maxRenderedAgents: 800,
      aggregatePopulationEnabled: true,
      populationScaleByWorldArea: true,
      safetyOrganismCeiling: 25000,
      safetyAgentCeiling: 2000,
      maxPopulationUnitsTotal: 1800,
      activeTileCount: 6000,
    }
  }

  setBottleneckKind(kind: import('../evolution/bottleneckRecovery').BottleneckKind): void {
    this.lastBottleneckKind = kind
  }

  getBiologicalPopulation(): number {
    return this.organisms.length + this.aggregate.getTotalCount()
  }

  getPopulationArchitectureMetrics(world: World): PopulationArchitectureMetrics {
    const config = this.getPopulationConfig()
    const ctx = this.buildCapacityContext(world)
    const habitatCap = getWorldCarryingCapacityByTrophicRole('producer', ctx)
    const bioPop = this.getBiologicalPopulation()
    const capacityPressure = habitatCap > 0 ? Math.min(1, bioPop / habitatCap) : 0
    const dominant = this.registry.getDominant()
    const expansionPressure = dominant
      ? getExpansionPressure(
          dominant.id,
          ctx,
          this.colonizedTiles.size,
          dominant.population,
        )
      : 0
    const trackedAtCap = this.organisms.length >= config.maxTrackedIndividuals * 0.95
    const aggregateGrowing = this.aggregate.getTotalCount() > 0

    const unitSnap = this.aggregate.getSnapshot()
    const representation: import('../../types/life').RepresentationMetrics = {
      populationUnitsCount: unitSnap.unitCount,
      producerUnits: unitSnap.producerUnitCount,
      mobileCohorts: unitSnap.mobileCohortCount,
      averageRepresentedPerUnit: unitSnap.averageRepresentedPerUnit,
      largestUnitScale: unitSnap.largestUnitScale,
      compressionRatio: unitSnap.compressionRatio,
      estimatedBiologicalPopulation: this.getBiologicalPopulation(),
    }

    return {
      trackedIndividuals: this.organisms.length,
      aggregatePopulation: this.aggregate.getTotalCount(),
      totalBiologicalPopulation: bioPop,
      worldCarryingCapacityEstimate: habitatCap,
      capacityPressurePct: Math.round(capacityPressure * 1000) / 10,
      expansionPressurePct: Math.round(expansionPressure * 1000) / 10,
      artificialCapEngaged: trackedAtCap && capacityPressure < 0.85,
      representationCapped: trackedAtCap && aggregateGrowing,
      bottleneckKind: this.lastBottleneckKind === 'none' ? null : this.lastBottleneckKind,
      representation,
    }
  }

  buildCapacityContext(world: World, tileAgentCounts?: number[]): CarryingCapacityContext {
    return {
      world,
      tileBiomass: this.tileBiomass,
      tileCounts: this.tileCounts,
      tileAgentCounts,
      producerBiomass: this.cachedTotalBiomass + this.aggregate.getTotalBiomass(),
      species: this.registry.getAll(),
    }
  }

  seedInitialLife(world: World, emit: LifeEventEmitter): void {
    const profile = world.originProfile
    let seeded = 0

    if (profile.founderSites.length > 0) {
      for (const site of profile.founderSites) {
        if (seeded >= 64) break
        this.spawnFounder(site.lifeKind, site.x, site.y, world, 0)
        seeded += 1
      }
    } else {
      this.seedInitialLifeLegacy(world, emit)
      return
    }

    this.rebuildTileIndex(world)
    this.colonizedTiles.clear()
    for (let i = 0; i < this.tileCounts.length; i++) {
      if (this.tileCounts[i] > 0) this.colonizedTiles.add(i)
    }
    if (this.organisms.length > 0) {
      const speciesCount = this.registry.getAll().filter((s) => s.population > 0).length
      emit(
        'life.first',
        `First life seeded (${profile.originProfileName}): ${this.organisms.length} founder organisms across ${speciesCount} lineages — ${profile.explanation}`,
      )
    }
    this.lastPopulation = this.organisms.length
    this.lastBiomass = this.cachedTotalBiomass
    this.lastDominantSpeciesId = this.registry.getDominant()?.id ?? null
    this.captureSpeciesPopulations()
  }

  /** Fallback seeding when origin profile has no sites. */
  private seedInitialLifeLegacy(world: World, emit: LifeEventEmitter): void {
    const spawnRng = forkRng(this.seed, 'life-seed')
    let seeded = 0

    for (const tile of world.tiles) {
      if (seeded >= 48) break
      if (!isTileActive(world, tile.x, tile.y)) continue

      if (tile.terrain === 'hydrothermal_vent') {
        this.spawnFounder('ChemosyntheticMicrobe', tile.x, tile.y, world, 0)
        seeded += 1
      }
    }

    for (const tile of world.tiles) {
      if (seeded >= 48) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      if (
        (tile.terrain === 'coast' || tile.terrain === 'ocean' || tile.terrain === 'river') &&
        tile.water > 0.4 &&
        spawnRng() > 0.92
      ) {
        this.spawnFounder('PhotosyntheticMicrobe', tile.x, tile.y, world, 0)
        seeded += 1
      }
    }

    for (const tile of world.tiles) {
      if (seeded >= 48) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      if (
        (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.terrain === 'river') &&
        tile.water > 0.5 &&
        spawnRng() > 0.94
      ) {
        this.spawnFounder('Algae', tile.x, tile.y, world, 0)
        seeded += 1
      }
    }

    for (const tile of world.tiles) {
      if (seeded >= 64) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      if (
        (tile.terrain === 'grassland' || tile.terrain === 'forest' || tile.terrain === 'swamp' || tile.terrain === 'marsh') &&
        tile.soilFertility > 0.35 &&
        tile.water > 0.25 &&
        spawnRng() > 0.96
      ) {
        this.spawnFounder('PrimitivePlant', tile.x, tile.y, world, 0)
        seeded += 1
      }
    }

    this.rebuildTileIndex(world)
    this.colonizedTiles.clear()
    for (let i = 0; i < this.tileCounts.length; i++) {
      if (this.tileCounts[i] > 0) this.colonizedTiles.add(i)
    }
    if (this.organisms.length > 0) {
      const speciesCount = this.registry.getAll().filter((s) => s.population > 0).length
      emit(
        'life.first',
        `First life seeded: ${this.organisms.length} founder organisms across ${speciesCount} founder species lineages`,
      )
    }
    this.lastPopulation = this.organisms.length
    this.lastBiomass = this.cachedTotalBiomass
    this.lastDominantSpeciesId = this.registry.getDominant()?.id ?? null
    this.captureSpeciesPopulations()
  }

  /** Disaster: reduce biomass on a tile; returns organisms killed. */
  applyBiomassStress(world: World, tileIndex: number, burnFactor: number, tick: number): number {
    const w = world.width
    const x = tileIndex % w
    const y = Math.floor(tileIndex / w)
    let killed = 0
    let stressIdx = 0
    for (const organism of this.organisms) {
      if (organism.x !== x || organism.y !== y) continue
      const rng = forkRng(this.seed, `stress-burn-${tick}-${tileIndex}-${stressIdx++}`)
      if (rng() < burnFactor) {
        organism.health -= 0.4 + burnFactor * 0.5
        if (organism.health <= 0) killed += 1
      } else {
        organism.health -= burnFactor * 0.15
      }
    }
    return killed
  }

  /** Disaster: apply extra mortality pressure on a tile. */
  applyMortalityPressure(world: World, tileIndex: number, pressure: number): number {
    const w = world.width
    const x = tileIndex % w
    const y = Math.floor(tileIndex / w)
    let killed = 0
    for (const organism of this.organisms) {
      if (organism.x !== x || organism.y !== y) continue
      organism.health -= pressure
      if (organism.health <= 0 || organism.energy <= 0) killed += 1
    }
    return killed
  }

  tick(world: World, tick: number, emit: LifeEventEmitter, suppressMinorEvents = false): void {
    this.tickRng = forkRng(this.seed, `life-tick-${tick}`)
    this.syncLiveTileCounts()
    const deaths: string[] = []
    const births: LifeOrganism[] = []
    let birthsThisTick = 0
    const prePopulation = this.organisms.length
    const preSpeciesIds = suppressMinorEvents
      ? null
      : new Set(this.registry.getAll().filter((s) => s.population > 0).map((s) => s.id))

    for (const organism of this.organisms) {
      const tile = getTileAt(world, organism.x, organism.y)
      if (!tile) {
        deaths.push(organism.id)
        continue
      }

      const gain = computeEnergyGain(organism.kind, tile, organism.genome)
      const metabolism = computeMetabolismCost(organism.genome) + BASE_METABOLISM
      organism.energy = Math.min(1, organism.energy + gain - metabolism)

      const stress = environmentalStress(tile, organism.genome)
      if (stress > 0.5) {
        organism.health -= stress * 0.04
      }
      if (organism.energy < 0.12) {
        organism.health -= 0.06
      }

      organism.age += 1
      if (organism.reproductionCooldown > 0) organism.reproductionCooldown -= 1

      if (organism.age >= organism.maxAge || organism.health <= 0 || organism.energy <= 0) {
        deaths.push(organism.id)
        continue
      }

      if (
        organism.energy >= REPRODUCTION_ENERGY_THRESHOLD &&
        organism.reproductionCooldown <= 0 &&
        birthsThisTick < MAX_BIRTHS_PER_TICK
      ) {
        const child = this.tryReproduce(organism, world, tick, emit, suppressMinorEvents)
        if (child) {
          if (child === 'aggregate') {
            birthsThisTick += 1
          } else {
            births.push(child)
            birthsThisTick += 1
          }
          organism.energy -= REPRODUCTION_ENERGY_COST
          organism.reproductionCooldown = Math.round(18 / Math.max(0.12, organism.genome.reproductionRate))
          if (!suppressMinorEvents && child !== 'aggregate') {
            const tileIdx = (child as LifeOrganism).y * world.width + (child as LifeOrganism).x
            this.recentActivityTiles.add(tileIdx)
          }
        }
      }
    }

    if (deaths.length > 0) {
      const dead = new Set(deaths)
      const next: LifeOrganism[] = []
      for (const organism of this.organisms) {
        if (dead.has(organism.id)) {
          const idx = organism.y * world.width + organism.x
          this.liveTileCounts[idx] = Math.max(0, (this.liveTileCounts[idx] ?? 0) - 1)
        } else {
          next.push(organism)
        }
      }
      this.organisms = next
    }

    for (const child of births) {
      const idx = child.y * world.width + child.x
      this.liveTileCounts[idx] = (this.liveTileCounts[idx] ?? 0) + 1
      if ((this.liveTileCounts[idx] ?? 0) === 1) {
        this.colonizedTiles.add(idx)
      }
    }

    this.organisms.push(...births)
    this.rebuildTileIndex(world)

    const ctx = this.buildCapacityContext(world)
    const aggGrowth = this.aggregate.tickProducerGrowth(
      world,
      ctx,
      forkRng(this.seed, `agg-grow-${tick}`),
      this.recoveryMods.dispersalBoost,
      tick,
    )
    if (aggGrowth.growth > 0 || aggGrowth.dispersals > 0) {
      this.rebuildTileIndex(world)
    }

    if (!suppressMinorEvents && this.capacityPressureCooldown <= 0) {
      const metrics = this.getPopulationArchitectureMetrics(world)
      if (metrics.artificialCapEngaged && metrics.representationCapped) {
        this.capacityPressureCooldown = 400
        emit(
          'population.capacity_pressure',
          `Producer population representation-capped; ${this.aggregate.getTotalCount()} in aggregate pools (${metrics.capacityPressurePct}% habitat fill).`,
        )
      } else if (aggGrowth.dispersals > 0) {
        this.capacityPressureCooldown = 600
        emit('population.expansion_wave', `Expansion wave — ${aggGrowth.dispersals} aggregate dispersal events this tick.`)
      } else if (metrics.capacityPressurePct >= 85 && metrics.expansionPressurePct >= 50) {
        this.capacityPressureCooldown = 500
        emit(
          'evolution.competition_pressure',
          `Local carrying capacity pressure (${metrics.capacityPressurePct}%) — competition and specialization increasing.`,
        )
      }
    }
    if (this.capacityPressureCooldown > 0) this.capacityPressureCooldown -= 1

    this.lastTickBirths = births.length + (aggGrowth.growth > 0 ? 1 : 0)
    this.lastTickDeaths = deaths.length

    if (births.length > 0 && !suppressMinorEvents) {
      if (!this.firstReproductionLogged) {
        this.firstReproductionLogged = true
        emit(
          'life.reproduce',
          `First reproduction: ${births.length} offspring born (population ${this.organisms.length})`,
        )
      }
    }

    if (!suppressMinorEvents && preSpeciesIds) {
      this.detectPopulationEvents(world, tick, emit, prePopulation, preSpeciesIds)
      this.captureSpeciesPopulations()
    } else if (!suppressMinorEvents) {
      this.lastPopulation = this.organisms.length
      this.cachedTotalBiomass = this.computeTotalBiomass()
      this.lastBiomass = this.cachedTotalBiomass
    }
  }

  /** Run multiple ticks with minimal event/index overhead (deep-time batches). */
  tickBatch(world: World, startTick: number, count: number): number {
    let t = startTick
    for (let i = 0; i < count; i++) {
      t += 1
      this.tick(world, t, NOOP_EMIT, true)
    }
    return t
  }

  getOrganismCount(): number {
    return this.organisms.length
  }

  getLastTickVitals(): { births: number; deaths: number } {
    return { births: this.lastTickBirths, deaths: this.lastTickDeaths }
  }

  getMaxTileOrganismCount(): number {
    let max = 0
    for (const count of this.tileCounts) {
      if (count > max) max = count
    }
    return max
  }

  quarantineInvalid(world: World): number {
    let removed = 0
    const next: LifeOrganism[] = []
    for (const organism of this.organisms) {
      const reason = sanitizeOrganism(organism, world)
      if (reason) {
        removed += 1
        continue
      }
      clampOrganismVitals(organism)
      next.push(organism)
    }
    if (removed > 0) {
      this.organisms = next
      this.rebuildTileIndex(world)
    }
    return removed
  }

  getSnapshot(
    includeOrganisms = true,
    world?: World,
    agents: import('../../types/agents').MobileAgent[] = [],
  ): LifeSnapshot {
    let occupancy = this.speciesOccupancyCache
    if (world && agents.length > 0) {
      occupancy = buildSpeciesOccupancy(
        this.organisms,
        this.registry.getAll(),
        world,
        agents,
        this.aggregate.getAllUnits(),
      )
    }

    const aggSnap = this.aggregate.getSnapshot()
    const popMetrics = world ? this.getPopulationArchitectureMetrics(world) : null

    return {
      organisms: includeOrganisms ? [...this.organisms] : [],
      species: this.registry.getAll(),
      totalOrganisms: this.organisms.length,
      aggregateOrganisms: aggSnap.totalEstimatedIndividuals,
      totalBiologicalPopulation: this.organisms.length + aggSnap.totalEstimatedIndividuals,
      totalBiomass: this.cachedTotalBiomass,
      aggregateBiomass: aggSnap.totalBiomass,
      tileCounts: this.tileCounts,
      tileBiomass: this.tileBiomass,
      speciesOccupancy: occupancy,
      populationArchitecture: popMetrics ?? {
        trackedIndividuals: this.organisms.length,
        aggregatePopulation: aggSnap.totalEstimatedIndividuals,
        totalBiologicalPopulation: this.organisms.length + aggSnap.totalEstimatedIndividuals,
        worldCarryingCapacityEstimate: 0,
        capacityPressurePct: 0,
        expansionPressurePct: 0,
        artificialCapEngaged: false,
        representationCapped: false,
        bottleneckKind: null,
        representation: {
          populationUnitsCount: aggSnap.unitCount,
          producerUnits: aggSnap.producerUnitCount,
          mobileCohorts: aggSnap.mobileCohortCount,
          averageRepresentedPerUnit: aggSnap.averageRepresentedPerUnit,
          largestUnitScale: aggSnap.largestUnitScale,
          compressionRatio: aggSnap.compressionRatio,
          estimatedBiologicalPopulation: this.organisms.length + aggSnap.totalEstimatedIndividuals,
        },
      },
      populationUnits: aggSnap.topUnits,
      representationMetrics: {
        populationUnitsCount: aggSnap.unitCount,
        producerUnits: aggSnap.producerUnitCount,
        mobileCohorts: aggSnap.mobileCohortCount,
        averageRepresentedPerUnit: aggSnap.averageRepresentedPerUnit,
        largestUnitScale: aggSnap.largestUnitScale,
        compressionRatio: aggSnap.compressionRatio,
        estimatedBiologicalPopulation: this.organisms.length + aggSnap.totalEstimatedIndividuals,
      },
    }
  }

  getSpeciesPopHistory(): Map<string, number> {
    return new Map(this.speciesPopHistory)
  }

  getColonizedTileCount(): number {
    return this.colonizedTiles.size
  }

  getRecentActivityTiles(): number[] {
    return [...this.recentActivityTiles]
  }

  clearRecentActivity(): void {
    this.recentActivityTiles.clear()
  }

  countChangedTiles(previousCounts: number[]): number {
    let changed = 0
    for (let i = 0; i < this.tileCounts.length; i++) {
      if ((this.tileCounts[i] ?? 0) !== (previousCounts[i] ?? 0)) changed += 1
    }
    return changed
  }

  setRecoveryModifiers(mods: RecoveryModifiers): void {
    this.recoveryMods = mods
  }

  getRegistry(): SpeciesRegistry {
    return this.registry
  }

  /** Consume producer biomass on a tile for herbivory — returns amount consumed. */
  consumeBiomassAt(x: number, y: number, amount: number, world: World): number {
    const onTile = this.organisms.filter((o) => o.x === x && o.y === y)
    const idx = y * world.width + x
    let consumed = this.aggregate.consumeBiomassAt(idx, amount)
    let remaining = amount - consumed

    if (onTile.length === 0 && consumed > 0) return consumed

    const sorted = [...onTile].sort((a, b) => a.biomass - b.biomass)

    for (const organism of sorted) {
      if (remaining <= 0) break
      const take = Math.min(remaining, organism.biomass * 0.4, 0.25)
      if (take <= 0.01) continue
      organism.biomass = Math.max(0.05, organism.biomass - take)
      organism.energy = Math.max(0, organism.energy - take * 0.5)
      if (organism.biomass < 0.08 || organism.energy <= 0.02) {
        organism.health = 0
      }
      remaining -= take
      consumed += take
    }

    if (consumed > 0) {
      this.rebuildTileIndex(world)
    }
    return consumed
  }

  getTileBiomassArray(): number[] {
    return this.tileBiomass
  }

  getTileCountsArray(): number[] {
    return this.tileCounts
  }

  getPopulationMap(): Map<string, { count: number; biomass: number }> {
    const popMap = new Map<string, { count: number; biomass: number }>()
    for (const organism of this.organisms) {
      const stats = popMap.get(organism.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += 1
      stats.biomass += organism.biomass
      popMap.set(organism.speciesId, stats)
    }
    for (const [speciesId, stats] of this.aggregate.getPopulationMap()) {
      const existing = popMap.get(speciesId) ?? { count: 0, biomass: 0 }
      existing.count += stats.count
      existing.biomass += stats.biomass
      popMap.set(speciesId, existing)
    }
    return popMap
  }

  getTileLife(world: World, x: number, y: number): TileLifeData {
    const idx = y * world.width + x
    const organisms = this.organisms.filter((o) => o.x === x && o.y === y)
    return {
      count: this.tileCounts[idx] ?? 0,
      biomass: this.tileBiomass[idx] ?? 0,
      organisms,
    }
  }

  reset(world: World, emit: LifeEventEmitter): void {
    this.organisms = []
    this.aggregate.clear()
    this.popConfig = buildPopulationConfig(world)
    this.aggregate.init(world)
    this.registry.clear()
    resetSpeciesCounter()
    this.tickRng = forkRng(this.seed, 'life')
    this.lastPopulation = 0
    this.lastBiomass = 0
    this.lastDominantSpeciesId = null
    this.firstReproductionLogged = false
    this.colonizedTiles.clear()
    this.speciesPopHistory.clear()
    this.bloomCooldown = 0
    this.dieOffCooldown = 0
    this.recentActivityTiles.clear()
    this.speciesOccupancyCache = {}
    this.cachedTotalBiomass = 0
    this.liveTileCounts = []
    this.capacityPressureCooldown = 0
    this.lastBottleneckKind = 'none'
    this.recoveryMods = {
      reproductionBoost: 1,
      dispersalBoost: 1,
      mutationVarianceBoost: 1,
      overcrowdingRelief: 1,
    }
    this.initTileArrays(world)
    this.seedInitialLife(world, emit)
  }

  private syncLiveTileCounts(): void {
    if (this.liveTileCounts.length !== this.tileCounts.length) {
      this.liveTileCounts = [...this.tileCounts]
      return
    }
    for (let i = 0; i < this.tileCounts.length; i++) {
      this.liveTileCounts[i] = this.tileCounts[i]
    }
  }

  private computeTotalBiomass(): number {
    let total = 0
    for (const organism of this.organisms) {
      total += organism.biomass
    }
    return total
  }

  private initTileArrays(world: World): void {
    const size = world.width * world.height
    if (this.tileCounts.length !== size) {
      this.tileCounts = new Array(size).fill(0)
      this.tileBiomass = new Array(size).fill(0)
      this.liveTileCounts = new Array(size).fill(0)
    } else {
      this.tileCounts.fill(0)
      this.tileBiomass.fill(0)
    }
  }

  private spawnFounder(kind: LifeKind, x: number, y: number, world: World, tick: number): void {
    if (!isTileActive(world, x, y)) return
    if (this.countAtTile(x, y, world) >= MAX_ORGANISMS_PER_TILE) return

    const config = this.getPopulationConfig()
    const bioPop = this.getBiologicalPopulation()
    if (bioPop >= config.safetyOrganismCeiling) return

    if (this.organisms.length >= config.maxTrackedIndividuals) {
      if (!config.aggregatePopulationEnabled) return
      const founder = createFounderOrganism(kind, '', x, y)
      const species = this.registry.getOrCreateFounderSpecies(kind, founder.genome, tick)
      this.aggregate.addPopulation(species.id, kind, y * world.width + x, 1, tick)
      return
    }

    const founder = createFounderOrganism(kind, '', x, y)
    const species = this.registry.getOrCreateFounderSpecies(kind, founder.genome, tick)
    founder.speciesId = species.id
    this.organisms.push(founder)
  }

  private countAtTile(x: number, y: number, world: World): number {
    return this.liveTileCounts[y * world.width + x] ?? 0
  }

  private tryReproduce(
    parent: LifeOrganism,
    world: World,
    tick: number,
    emit: LifeEventEmitter,
    suppressMinorEvents: boolean,
  ): LifeOrganism | 'aggregate' | null {
    if (this.tickRng() > parent.genome.reproductionRate * parent.genome.spreadRate * this.recoveryMods.reproductionBoost + 0.15) {
      return null
    }

    const config = this.getPopulationConfig()
    const ctx = this.buildCapacityContext(world)

    const candidates = neighborOffsets()
      .map(([dx, dy]) => ({ x: parent.x + dx, y: parent.y + dy }))
      .filter(({ x, y }) => {
        const tile = getTileAt(world, x, y)
        if (!tile) return false
        const idx = y * world.width + x
        const occ = this.countAtTile(x, y, world) + this.aggregate.getTileCount(idx)
        const cap = getTileCarryingCapacity(tile, parent.kind, ctx, parent.genome)
        if (cap <= 0 || occ >= cap * this.recoveryMods.overcrowdingRelief) return false
        return habitatSuitability(parent.kind, tile, parent.genome) > 0.2
      })

    if (candidates.length === 0) {
      const home = getTileAt(world, parent.x, parent.y)
      const homeIdx = parent.y * world.width + parent.x
      const homeOcc = this.countAtTile(parent.x, parent.y, world) + this.aggregate.getTileCount(homeIdx)
      const homeCap = home ? getTileCarryingCapacity(home, parent.kind, ctx, parent.genome) : 0
      if (!home || homeOcc >= Math.min(MAX_ORGANISMS_PER_TILE, homeCap)) {
        return null
      }
      candidates.push({ x: parent.x, y: parent.y })
    }

    const pick = candidates[Math.floor(this.tickRng() * candidates.length)]
    const pickIdx = pick.y * world.width + pick.x
    const childGenome = mutateGenome(
      parent.genome,
      forkRng(this.seed, `mut-${parent.speciesId}-${parent.x}-${parent.y}-${parent.generation}-${tick}`),
    )
    let speciesId = parent.speciesId
    const childGeneration = parent.generation + 1
    const parentPop = this.registry.getPopulation(parent.speciesId)
    const homeTile = getTileAt(world, pick.x, pick.y) ?? getTileAt(world, parent.x, parent.y)

    if (homeTile) {
      const specConfig = DEFAULT_SPECIATION_CONFIG
      const branch = evaluateBranchCandidate(
        parent.genome,
        childGenome,
        homeTile,
        childGeneration,
        parentPop,
        specConfig,
        tick - (this.registry.get(parent.speciesId)?.createdAtTick ?? tick),
        1,
      )

      if (branch.shouldBranch) {
        const existing = this.registry.findByGenome(parent.kind, childGenome, specConfig.geneticDistanceVariantThreshold)
        if (existing && existing.establishmentStatus !== 'failed') {
          speciesId = existing.id
        } else {
          const species = this.registry.registerBranch(
            parent.kind,
            childGenome,
            tick,
            parent.speciesId,
            childGeneration,
            {
              rank: branch.rank,
              localFitnessScore: branch.localFitnessScore,
              adaptedTerrain: branch.adaptedTerrain,
              reason: branch.reason,
            },
          )
          speciesId = species.id
          if (!suppressMinorEvents && branch.rank !== 'variant') {
            emit(
              branch.rank === 'species' ? 'evolution.species_stabilized' : 'evolution.subspecies_emerged',
              adaptiveRadiationMessage(branch.rank, parent.kind, branch.reason, tick),
            )
          } else if (!suppressMinorEvents && branch.rank === 'variant' && this.tickRng() > 0.88) {
            emit('evolution.local_specialization', adaptiveRadiationMessage('variant', parent.kind, branch.reason, tick))
          }
        }
      }
    }

    const bioPop = this.getBiologicalPopulation()
    if (bioPop >= config.safetyOrganismCeiling) return null

    const trackedAtCap = this.organisms.length >= config.maxTrackedIndividuals
    const tileIndividuals = this.countAtTile(pick.x, pick.y, world)

    if (trackedAtCap || tileIndividuals >= MAX_ORGANISMS_PER_TILE) {
      if (!config.aggregatePopulationEnabled) return null
      this.aggregate.addPopulation(speciesId, parent.kind, pickIdx, 1, tick)
      if (this.aggregate.getUnitsForTile(pickIdx, 2).length === 1 && !suppressMinorEvents) {
        const tile = getTileAt(world, pick.x, pick.y)
        if (tile) {
          emit(
            'population.range_expansion',
            `${parent.kind} aggregate pool expanded into ${tile.terrain.replace(/_/g, ' ')} at (${pick.x}, ${pick.y}).`,
          )
        }
      }
      return 'aggregate'
    }

    const wasEmpty = tileIndividuals === 0 && this.aggregate.getTileCount(pickIdx) === 0
    const child = createOrganism(parent.kind, speciesId, pick.x, pick.y, childGenome, childGeneration)

    if (wasEmpty && !suppressMinorEvents) {
      const tile = getTileAt(world, pick.x, pick.y)
      if (tile) {
        emit(
          'life.colonization',
          `${parent.kind} colonized ${tile.terrain.replace(/_/g, ' ')} at (${pick.x}, ${pick.y})`,
        )
      }
    }

    return child
  }

  private rebuildTileIndex(world: World): void {
    this.initTileArrays(world)
    const popMap = new Map<string, { count: number; biomass: number }>()
    let totalBiomass = 0

    for (const organism of this.organisms) {
      const idx = organism.y * world.width + organism.x
      this.tileCounts[idx] += 1
      this.tileBiomass[idx] += organism.biomass
      totalBiomass += organism.biomass

      const stats = popMap.get(organism.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += 1
      stats.biomass += organism.biomass
      popMap.set(organism.speciesId, stats)
    }

    const aggMap = this.aggregate.getPopulationMap()
    const aggSnap = this.aggregate.getSnapshot()
    for (let i = 0; i < aggSnap.tileAggregateCounts.length; i++) {
      this.tileCounts[i] += aggSnap.tileAggregateCounts[i] ?? 0
      this.tileBiomass[i] += aggSnap.tileAggregateBiomass[i] ?? 0
      totalBiomass += aggSnap.tileAggregateBiomass[i] ?? 0
    }

    for (const [speciesId, aggStats] of aggMap) {
      const stats = popMap.get(speciesId) ?? { count: 0, biomass: 0 }
      stats.count += aggStats.count
      stats.biomass += aggStats.biomass
      popMap.set(speciesId, stats)
    }

    this.cachedTotalBiomass = totalBiomass
    this.registry.updateCounts(popMap)
    const species = this.registry.getAll()
    this.speciesOccupancyCache = buildSpeciesOccupancy(
      this.organisms,
      species,
      world,
      [],
      this.aggregate.getAllUnits(),
    )
  }

  private captureSpeciesPopulations(): void {
    for (const species of this.registry.getAll()) {
      this.speciesPopHistory.set(species.id, species.population)
    }
    if (this.speciesPopHistory.size > MAX_SPECIES_POP_HISTORY) {
      const alive = new Set(this.registry.getAll().map((s) => s.id))
      for (const id of this.speciesPopHistory.keys()) {
        if (!alive.has(id)) this.speciesPopHistory.delete(id)
        if (this.speciesPopHistory.size <= MAX_SPECIES_POP_HISTORY) break
      }
    }
  }

  private detectPopulationEvents(
    _world: World,
    _tick: number,
    emit: LifeEventEmitter,
    prePopulation: number,
    preSpeciesIds: Set<string>,
  ): void {
    const population = this.organisms.length
    const biomass = this.cachedTotalBiomass
    const populationDelta = population - this.lastPopulation
    const biomassDelta = biomass - this.lastBiomass

      if (
        populationDelta >= BLOOM_THRESHOLD &&
        this.bloomCooldown <= 0 &&
        population > prePopulation
      ) {
        emit(
          'life.bloom',
          `Population bloom: +${populationDelta} organisms (now ${population}, biomass ${biomass.toFixed(1)})`,
        )
        this.bloomCooldown = 15
      } else if (this.bloomCooldown > 0) {
        this.bloomCooldown -= 1
      }

      const populationDrop = this.lastPopulation - population
      if (
        populationDrop >= DIE_OFF_THRESHOLD &&
        this.lastPopulation > 30 &&
        this.dieOffCooldown <= 0
      ) {
        emit(
          'life.die_off',
          `Die-off: −${populationDrop} organisms (population now ${population})`,
        )
        this.dieOffCooldown = 15
      } else if (this.dieOffCooldown > 0) {
        this.dieOffCooldown -= 1
      }

      if (
        this.lastBiomass > 0 &&
        Math.abs(biomassDelta) / this.lastBiomass >= BIOMASS_SWING_RATIO &&
        Math.abs(biomassDelta) > 5
      ) {
        const direction = biomassDelta > 0 ? 'surge' : 'collapse'
        emit(
          'life.bloom',
          `Biomass ${direction}: ${biomassDelta > 0 ? '+' : ''}${biomassDelta.toFixed(1)} (total ${biomass.toFixed(1)})`,
        )
      }

    for (const species of this.registry.getAll()) {
      if (species.population === 0 && preSpeciesIds.has(species.id) && !species.isFounderLineage) {
        emit('life.extinction', `Extinction: "${species.name}" (${species.kind}) — population reached zero`)
      }
    }

    const dominant = this.registry.getDominant()
    if (
      dominant &&
      this.lastDominantSpeciesId &&
      dominant.id !== this.lastDominantSpeciesId
    ) {
      const prev = this.registry.get(this.lastDominantSpeciesId)
      emit(
        'life.population_shift',
        `Dominant species shift: ${prev?.name ?? 'unknown'} → ${dominant.name} (${dominant.population} organisms)`,
      )
    }

    this.lastPopulation = population
    this.lastBiomass = biomass
    this.lastDominantSpeciesId = dominant?.id ?? null
  }
}

export function tileIndex(x: number, y: number, width: number): number {
  return y * width + x
}

export function maxTileDensity(tileCounts: number[]): number {
  let max = 0
  for (const count of tileCounts) {
    if (count > max) max = count
  }
  return max
}

export function topSpeciesOnTile(
  organisms: LifeOrganism[],
  x: number,
  y: number,
): { speciesId: string; kind: LifeKind; count: number }[] {
  const onTile = organisms.filter((o) => o.x === x && o.y === y)
  const counts = new Map<string, { kind: LifeKind; count: number }>()
  for (const o of onTile) {
    const entry = counts.get(o.speciesId) ?? { kind: o.kind, count: 0 }
    entry.count += 1
    counts.set(o.speciesId, entry)
  }
  return [...counts.entries()]
    .map(([speciesId, { kind, count }]) => ({ speciesId, kind, count }))
    .sort((a, b) => b.count - a.count)
}
