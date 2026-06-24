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
import { createFounderOrganism, createOrganism } from './createLife'
import { SpeciesRegistry, resetSpeciesCounter } from '../species/speciesRegistry'
import { DEFAULT_SPECIATION_CONFIG } from '../species/speciationConfig'

export type LifeEventEmitter = (type: string, message: string) => void

const BLOOM_THRESHOLD = 40
const DIE_OFF_THRESHOLD = 20
const BIOMASS_SWING_RATIO = 0.35

export class LifeSystem {
  private organisms: LifeOrganism[] = []
  private readonly registry = new SpeciesRegistry()
  private tileCounts: number[] = []
  private tileBiomass: number[] = []
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

      if (tile.terrain === 'hydrothermal_vent') {
        this.spawnFounder('ChemosyntheticMicrobe', tile.x, tile.y, world, 0)
        seeded += 1
      }
    }

    for (const tile of world.tiles) {
      if (seeded >= 48) break
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
    this.trackColonizedTiles(world)
    if (this.organisms.length > 0) {
      const speciesCount = this.registry.getAll().filter((s) => s.population > 0).length
      emit(
        'life.first',
        `First life seeded: ${this.organisms.length} founder organisms across ${speciesCount} founder species lineages`,
      )
    }
    this.lastPopulation = this.organisms.length
    this.lastBiomass = this.computeTotalBiomass()
    this.lastDominantSpeciesId = this.registry.getDominant()?.id ?? null
    this.captureSpeciesPopulations()
  }

  tick(world: World, tick: number, emit: LifeEventEmitter, suppressMinorEvents = false): void {
    this.tickRng = forkRng(this.seed, `life-tick-${tick}`)
    const deaths: string[] = []
    const births: LifeOrganism[] = []
    const prePopulation = this.organisms.length
    const preSpeciesIds = new Set(this.registry.getAll().filter((s) => s.population > 0).map((s) => s.id))

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
          const tileIdx = child.y * world.width + child.x
          this.recentActivityTiles.add(tileIdx)
        }
      }
    }

    if (deaths.length > 0) {
      const dead = new Set(deaths)
      this.organisms = this.organisms.filter((o) => !dead.has(o.id))
    }

    this.organisms.push(...births)
    this.rebuildTileIndex(world)
    this.trackColonizedTiles(world)

    if (births.length > 0 && !suppressMinorEvents) {
      if (!this.firstReproductionLogged) {
        this.firstReproductionLogged = true
        emit(
          'life.reproduce',
          `First reproduction: ${births.length} offspring born (population ${this.organisms.length})`,
        )
      }
    }

    this.detectPopulationEvents(world, tick, emit, prePopulation, preSpeciesIds, suppressMinorEvents)
    this.captureSpeciesPopulations()
  }

  getSnapshot(): LifeSnapshot {
    return {
      organisms: [...this.organisms],
      species: this.registry.getAll(),
      totalOrganisms: this.organisms.length,
      totalBiomass: this.computeTotalBiomass(),
      tileCounts: [...this.tileCounts],
      tileBiomass: [...this.tileBiomass],
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
    this.initTileArrays(world)
    this.seedInitialLife(world, emit)
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
    this.tileCounts = new Array(size).fill(0)
    this.tileBiomass = new Array(size).fill(0)
  }

  private spawnFounder(kind: LifeKind, x: number, y: number, _world: World, tick: number): void {
    if (this.countAtTile(x, y) >= MAX_ORGANISMS_PER_TILE) return
    if (this.organisms.length >= MAX_TOTAL_ORGANISMS) return

    const founder = createFounderOrganism(kind, '', x, y)
    const species = this.registry.getOrCreateFounderSpecies(kind, founder.genome, tick)
    founder.speciesId = species.id
    this.organisms.push(founder)
  }

  private countAtTile(x: number, y: number): number {
    return this.organisms.filter((o) => o.x === x && o.y === y).length
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
        if (this.countAtTile(x, y) >= MAX_ORGANISMS_PER_TILE) return false
        const cap = tileCarryingCapacity(parent.kind, tile)
        if (cap <= 0) return false
        return habitatSuitability(parent.kind, tile, parent.genome) > 0.2
      })

    if (candidates.length === 0) {
      const home = getTileAt(world, parent.x, parent.y)
      if (!home || this.countAtTile(parent.x, parent.y) >= MAX_ORGANISMS_PER_TILE) {
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

    const wasEmpty = this.countAtTile(pick.x, pick.y) === 0
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

    for (const organism of this.organisms) {
      const idx = organism.y * world.width + organism.x
      this.tileCounts[idx] += 1
      this.tileBiomass[idx] += organism.biomass

      const stats = popMap.get(organism.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += 1
      stats.biomass += organism.biomass
      popMap.set(organism.speciesId, stats)
    }

    this.registry.updateCounts(popMap)
  }

  private trackColonizedTiles(world: World): void {
    for (const organism of this.organisms) {
      this.colonizedTiles.add(organism.y * world.width + organism.x)
    }
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
    suppressMinorEvents: boolean,
  ): void {
    const population = this.organisms.length
    const biomass = this.computeTotalBiomass()
    const populationDelta = population - this.lastPopulation
    const biomassDelta = biomass - this.lastBiomass

    if (!suppressMinorEvents) {
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
    }

    for (const species of this.registry.getAll()) {
      if (species.population === 0 && preSpeciesIds.has(species.id) && !species.isFounderLineage) {
        if (!suppressMinorEvents) {
          emit('life.extinction', `Extinction: "${species.name}" (${species.kind}) — population reached zero`)
        }
      }
    }

    const dominant = this.registry.getDominant()
    if (
      dominant &&
      this.lastDominantSpeciesId &&
      dominant.id !== this.lastDominantSpeciesId &&
      !suppressMinorEvents
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
