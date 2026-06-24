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

export type LifeEventEmitter = (type: string, message: string) => void

export class LifeSystem {
  private organisms: LifeOrganism[] = []
  private readonly registry = new SpeciesRegistry()
  private tileCounts: number[] = []
  private tileBiomass: number[] = []
  private readonly seed: string
  private tickRng: Rng
  private reproductionMilestone = 0
  private lastPopulation = 0

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
    if (this.organisms.length > 0) {
      emit(
        'life.first',
        `First life seeded: ${this.organisms.length} founder organisms across chemosynthetic, photosynthetic, algal, and plant archetypes`,
      )
    }
    this.lastPopulation = this.organisms.length
  }

  tick(world: World, tick: number, emit: LifeEventEmitter): void {
    this.tickRng = forkRng(this.seed, `life-tick-${tick}`)
    const deaths: string[] = []
    const births: LifeOrganism[] = []

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
        const child = this.tryReproduce(organism, world, tick, emit)
        if (child) {
          births.push(child)
          organism.energy -= REPRODUCTION_ENERGY_COST
          organism.reproductionCooldown = Math.round(18 / Math.max(0.12, organism.genome.reproductionRate))
        }
      }
    }

    if (deaths.length > 0) {
      const dead = new Set(deaths)
      this.organisms = this.organisms.filter((o) => !dead.has(o.id))
    }

    this.organisms.push(...births)
    this.rebuildTileIndex(world)

    if (births.length > 0) {
      this.reproductionMilestone += births.length
      if (this.reproductionMilestone === births.length || this.reproductionMilestone % 25 === 0) {
        emit(
          'life.reproduce',
          `Reproduction milestone: ${births.length} births this tick (total population ${this.organisms.length})`,
        )
      }
    }

    const populationDrop = this.lastPopulation - this.organisms.length
    if (populationDrop >= 20 && this.lastPopulation > 30) {
      emit('life.die_off', `Die-off: ${populationDrop} organisms lost (population now ${this.organisms.length})`)
    }
    this.lastPopulation = this.organisms.length
  }

  getSnapshot(): LifeSnapshot {
    let totalBiomass = 0
    for (const organism of this.organisms) {
      totalBiomass += organism.biomass
    }
    return {
      organisms: [...this.organisms],
      species: this.registry.getAll(),
      totalOrganisms: this.organisms.length,
      totalBiomass,
      tileCounts: [...this.tileCounts],
      tileBiomass: [...this.tileBiomass],
    }
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
    this.reproductionMilestone = 0
    this.lastPopulation = 0
    this.initTileArrays(world)
    this.seedInitialLife(world, emit)
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
    const species = this.registry.register(kind, founder.genome, tick)
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

    if (shouldSpeciate(parent.genome, childGenome)) {
      const existing = this.registry.findByGenome(parent.kind, childGenome)
      if (existing) {
        speciesId = existing.id
      } else {
        const species = this.registry.register(
          parent.kind,
          childGenome,
          tick,
          parent.speciesId,
          parent.generation + 1,
        )
        speciesId = species.id
        emit(
          'life.speciation',
          `New species "${species.name}" diverged from parent lineage (${parent.kind})`,
        )
      }
    }

    return createOrganism(
      parent.kind,
      speciesId,
      pick.x,
      pick.y,
      childGenome,
      parent.generation + 1,
    )
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
