import type {
  LifeKind,
  LifeOrganism,
  LifeSnapshot,
  TileLifeData,
} from '../../types/life'
import {
  MAX_ORGANISMS_PER_TILE,
  MAX_TOTAL_ORGANISMS,
  BASE_METABOLISM,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
} from '../../types/life'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { forkRng } from '../../utils/rng'
import { habitatSuitability, neighborOffsets, tileCarryingCapacity } from '../ecology/colonization'
import {
  computeEnergyGain,
  computeMetabolismCost,
  environmentalStress,
} from '../ecology/energy'
import { mutateGenome, shouldSpeciate } from '../genetics/mutation'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'
import {
  clampOrganismVitals,
  sanitizeOrganism,
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

  constructor(seed: string, world: World) {
    this.seed = seed
    this.tickRng = forkRng(seed, 'life')
    this.initTileArrays(world)
    resetSpeciesCounter()
    this.registry.clear()
  }

  seedInitialLife(world: World, emit: LifeEventEmitter): void {
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
        (tile.terrain === 'grassland' || tile.terrain === 'forest' || tile.terrain === 'swamp') &&
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

  tick(world: World, tick: number, emit: LifeEventEmitter, suppressMinorEvents = false): void {
    this.tickRng = forkRng(this.seed, `life-tick-${tick}`)
    this.syncLiveTileCounts()
    const deaths: string[] = []
    const births: LifeOrganism[] = []
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
        this.organisms.length + births.length < MAX_TOTAL_ORGANISMS
      ) {
        const child = this.tryReproduce(organism, world, tick, emit, suppressMinorEvents)
        if (child) {
          births.push(child)
          organism.energy -= REPRODUCTION_ENERGY_COST
          organism.reproductionCooldown = Math.round(18 / Math.max(0.12, organism.genome.reproductionRate))
          if (!suppressMinorEvents) {
            const tileIdx = child.y * world.width + child.x
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
      occupancy = buildSpeciesOccupancy(this.organisms, this.registry.getAll(), world, agents)
    }

    return {
      organisms: includeOrganisms ? [...this.organisms] : [],
      species: this.registry.getAll(),
      totalOrganisms: this.organisms.length,
      totalBiomass: this.cachedTotalBiomass,
      tileCounts: [...this.tileCounts],
      tileBiomass: [...this.tileBiomass],
      speciesOccupancy: occupancy,
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

  getRegistry(): SpeciesRegistry {
    return this.registry
  }

  /** Consume producer biomass on a tile for herbivory — returns amount consumed. */
  consumeBiomassAt(x: number, y: number, amount: number, world: World): number {
    const onTile = this.organisms.filter((o) => o.x === x && o.y === y)
    if (onTile.length === 0) return 0

    let remaining = amount
    let consumed = 0
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

  getPopulationMap(): Map<string, { count: number; biomass: number }> {
    const popMap = new Map<string, { count: number; biomass: number }>()
    for (const organism of this.organisms) {
      const stats = popMap.get(organism.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += 1
      stats.biomass += organism.biomass
      popMap.set(organism.speciesId, stats)
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
    if (this.organisms.length >= MAX_TOTAL_ORGANISMS) return

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
  ): LifeOrganism | null {
    if (this.tickRng() > parent.genome.reproductionRate * parent.genome.spreadRate + 0.15) {
      return null
    }

    const candidates = neighborOffsets()
      .map(([dx, dy]) => ({ x: parent.x + dx, y: parent.y + dy }))
      .filter(({ x, y }) => {
        const tile = getTileAt(world, x, y)
        if (!tile) return false
        if (this.countAtTile(x, y, world) >= MAX_ORGANISMS_PER_TILE) return false
        const cap = tileCarryingCapacity(parent.kind, tile)
        if (cap <= 0) return false
        return habitatSuitability(parent.kind, tile, parent.genome) > 0.2
      })

    if (candidates.length === 0) {
      const home = getTileAt(world, parent.x, parent.y)
      if (!home || this.countAtTile(parent.x, parent.y, world) >= MAX_ORGANISMS_PER_TILE) {
        return null
      }
      candidates.push({ x: parent.x, y: parent.y })
    }

    const pick = candidates[Math.floor(this.tickRng() * candidates.length)]
    const childGenome = mutateGenome(parent.genome, forkRng(this.seed, `mut-${parent.id}-${tick}`))
    let speciesId = parent.speciesId
    const childGeneration = parent.generation + 1
    const parentPop = this.registry.getPopulation(parent.speciesId)

    if (
      shouldSpeciate(
        parent.genome,
        childGenome,
        childGeneration,
        parentPop,
        DEFAULT_SPECIATION_CONFIG,
      )
    ) {
      const existing = this.registry.findByGenome(parent.kind, childGenome)
      if (existing) {
        speciesId = existing.id
      } else {
        const species = this.registry.registerBranch(
          parent.kind,
          childGenome,
          tick,
          parent.speciesId,
          childGeneration,
        )
        speciesId = species.id
        if (!suppressMinorEvents) {
          emit(
            'life.speciation',
            `New species "${species.name}" diverged from ${parent.kind} (gen ${childGeneration}, pop ${parentPop})`,
          )
        }
      }
    }

    const wasEmpty = this.countAtTile(pick.x, pick.y, world) === 0
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

    this.cachedTotalBiomass = totalBiomass
    this.registry.updateCounts(popMap)
    const species = this.registry.getAll()
    this.speciesOccupancyCache = buildSpeciesOccupancy(this.organisms, species, world)
  }

  private captureSpeciesPopulations(): void {
    for (const species of this.registry.getAll()) {
      this.speciesPopHistory.set(species.id, species.population)
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
