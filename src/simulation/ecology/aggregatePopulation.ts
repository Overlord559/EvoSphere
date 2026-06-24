import type { AgentKind } from '../../types/agents'
import type { LifeKind } from '../../types/life'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'
import { habitatSuitability, neighborOffsets } from './colonization'
import {
  getCrowdingPressure,
  getTileCarryingCapacity,
  type CarryingCapacityContext,
} from './carryingCapacity'

export interface AggregateEntry {
  speciesId: string
  tileIndex: number
  kind: LifeKind | AgentKind
  count: number
  biomass: number
}

export interface AggregatePopulationSnapshot {
  totalAggregateCount: number
  totalAggregateBiomass: number
  tileAggregateCounts: number[]
  tileAggregateBiomass: number[]
  speciesAggregateCounts: Record<string, number>
  topPools: AggregateEntry[]
}

function poolKey(speciesId: string, tileIndex: number): string {
  return `${speciesId}@${tileIndex}`
}

const DEFAULT_BIOMASS_PER_UNIT = 0.35
const AGENT_BIOMASS_PER_UNIT = 0.55
const MAX_GROWTH_PER_TICK = 12
const MAX_POOLS = 8000

export class AggregatePopulationStore {
  private pools = new Map<string, AggregateEntry>()
  private tileCounts: number[] = []
  private tileBiomass: number[] = []

  init(world: World): void {
    const size = world.width * world.height
    this.tileCounts = new Array(size).fill(0)
    this.tileBiomass = new Array(size).fill(0)
  }

  clear(): void {
    this.pools.clear()
    if (this.tileCounts.length > 0) {
      this.tileCounts.fill(0)
      this.tileBiomass.fill(0)
    }
  }

  getPoolCount(): number {
    return this.pools.size
  }

  getTotalCount(): number {
    let total = 0
    for (const entry of this.pools.values()) {
      total += entry.count
    }
    return Math.round(total)
  }

  getTotalBiomass(): number {
    let total = 0
    for (const entry of this.pools.values()) {
      total += entry.biomass
    }
    return total
  }

  getTileCount(tileIndex: number): number {
    return this.tileCounts[tileIndex] ?? 0
  }

  getTileBiomass(tileIndex: number): number {
    return this.tileBiomass[tileIndex] ?? 0
  }

  getSpeciesCount(speciesId: string): number {
    let count = 0
    for (const entry of this.pools.values()) {
      if (entry.speciesId === speciesId) count += entry.count
    }
    return count
  }

  addPopulation(
    speciesId: string,
    kind: LifeKind | AgentKind,
    tileIndex: number,
    count: number,
  ): number {
    if (count <= 0 || this.pools.size >= MAX_POOLS) return 0
    const biomassPer =
      kind === 'SimpleGrazer' || kind === 'SimplePredator' || kind === 'Scavenger'
        ? AGENT_BIOMASS_PER_UNIT
        : DEFAULT_BIOMASS_PER_UNIT

    const key = poolKey(speciesId, tileIndex)
    const existing = this.pools.get(key)
    if (existing) {
      existing.count += count
      existing.biomass += count * biomassPer
    } else {
      this.pools.set(key, {
        speciesId,
        tileIndex,
        kind,
        count,
        biomass: count * biomassPer,
      })
    }

    this.tileCounts[tileIndex] = (this.tileCounts[tileIndex] ?? 0) + count
    this.tileBiomass[tileIndex] = (this.tileBiomass[tileIndex] ?? 0) + count * biomassPer
    return count
  }

  consumeBiomassAt(tileIndex: number, amount: number): number {
    let remaining = amount
    let consumed = 0

    for (const [key, entry] of this.pools) {
      if (entry.tileIndex !== tileIndex || remaining <= 0) continue
      const take = Math.min(remaining, entry.biomass * 0.35, entry.biomass)
      if (take <= 0.01) continue
      entry.biomass = Math.max(0.02, entry.biomass - take)
      const unitsLost = Math.min(entry.count, Math.ceil(take / DEFAULT_BIOMASS_PER_UNIT))
      entry.count = Math.max(0, entry.count - unitsLost)
      this.tileCounts[tileIndex] = Math.max(0, (this.tileCounts[tileIndex] ?? 0) - unitsLost)
      this.tileBiomass[tileIndex] = Math.max(0, (this.tileBiomass[tileIndex] ?? 0) - take)
      remaining -= take
      consumed += take
      if (entry.count <= 0) this.pools.delete(key)
    }
    return consumed
  }

  tickProducerGrowth(
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    dispersalBoost = 1,
  ): { growth: number; dispersals: number } {
    let growth = 0
    let dispersals = 0

    for (const [key, entry] of [...this.pools.entries()]) {
      if (
        entry.kind === 'SimpleGrazer' ||
        entry.kind === 'SimplePredator' ||
        entry.kind === 'Scavenger'
      ) {
        continue
      }

      const x = entry.tileIndex % world.width
      const y = Math.floor(entry.tileIndex / world.width)
      const tile = getTileAt(world, x, y)
      if (!tile) continue

      const occupancy = entry.count + (ctx.tileCounts?.[entry.tileIndex] ?? 0)
      const cap = getTileCarryingCapacity(tile, entry.kind as LifeKind, ctx)
      if (cap <= 0) continue

      const crowding = getCrowdingPressure(tile, entry.kind, occupancy, ctx)
      if (crowding >= 0.98) {
        if (this.tryDispersal(entry, world, ctx, rng, dispersalBoost)) dispersals += 1
        continue
      }

      const suit = habitatSuitability(entry.kind as LifeKind, tile, {
        reproductionRate: 0.4,
        mutationRate: 0.04,
        energyEfficiency: 0.65,
        heatTolerance: 0.5,
        coldTolerance: 0.5,
        waterTolerance: 0.6,
        salinityTolerance: 0.5,
        lightUse: 0.5,
        chemicalUse: 0.5,
        spreadRate: 0.35,
        lifespan: 150,
        droughtResistance: 0.45,
        pressureTolerance: 0.5,
      })

      const room = Math.max(0, cap - occupancy)
      const growthRate = Math.min(MAX_GROWTH_PER_TICK, room * suit * (1 - crowding * 0.7) * 0.15)
      if (growthRate < 0.01) continue

      const add = Math.min(Math.floor(growthRate + rng() * 2), room, MAX_GROWTH_PER_TICK)
      if (add <= 0) continue

      entry.count += add
      entry.biomass += add * DEFAULT_BIOMASS_PER_UNIT
      this.tileCounts[entry.tileIndex] = (this.tileCounts[entry.tileIndex] ?? 0) + add
      this.tileBiomass[entry.tileIndex] =
        (this.tileBiomass[entry.tileIndex] ?? 0) + add * DEFAULT_BIOMASS_PER_UNIT
      growth += add

      if (entry.count <= 0) this.pools.delete(key)
      void key
    }

    return { growth, dispersals }
  }

  tickMobileReserve(
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    reproductionBoost = 1,
  ): { births: number; deaths: number } {
    let births = 0
    let deaths = 0

    for (const [key, entry] of [...this.pools.entries()]) {
      if (
        entry.kind !== 'SimpleGrazer' &&
        entry.kind !== 'SimplePredator' &&
        entry.kind !== 'Scavenger'
      ) {
        continue
      }

      const x = entry.tileIndex % world.width
      const y = Math.floor(entry.tileIndex / world.width)
      const tile = getTileAt(world, x, y)
      if (!tile) continue

      const cap = getTileCarryingCapacity(tile, entry.kind, ctx)
      const crowding = cap > 0 ? entry.count / cap : 1

      if (crowding > 0.95 && rng() > 0.7) {
        const loss = Math.min(2, Math.floor(entry.count * 0.02))
        entry.count -= loss
        entry.biomass -= loss * AGENT_BIOMASS_PER_UNIT
        deaths += loss
      } else if (crowding < 0.75 && rng() < 0.08 * reproductionBoost) {
        const birth = Math.min(3, Math.floor((1 - crowding) * 2))
        entry.count += birth
        entry.biomass += birth * AGENT_BIOMASS_PER_UNIT
        births += birth
      }

      if (entry.count <= 0) this.pools.delete(key)
      void key
    }

    return { births, deaths }
  }

  private tryDispersal(
    entry: AggregateEntry,
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    dispersalBoost: number,
  ): boolean {
    if (entry.count < 2 || rng() > 0.12 * dispersalBoost) return false

    const srcX = entry.tileIndex % world.width
    const srcY = Math.floor(entry.tileIndex / world.width)
    const neighbors = neighborOffsets()
      .map(([dx, dy]) => ({ x: srcX + dx, y: srcY + dy }))
      .filter(({ x, y }) => isTileActive(world, x, y))

    if (neighbors.length === 0) return false

    const target = neighbors[Math.floor(rng() * neighbors.length)]
    const tile = getTileAt(world, target.x, target.y)
    if (!tile) return false

    const destIdx = target.y * world.width + target.x
    const cap = getTileCarryingCapacity(tile, entry.kind as LifeKind, ctx)
    const occ =
      (ctx.tileCounts?.[destIdx] ?? 0) + (ctx.tileAgentCounts?.[destIdx] ?? 0) + this.getTileCount(destIdx)
    if (cap <= 0 || occ >= cap) return false

    const move = Math.min(4, Math.floor(entry.count * 0.08))
    if (move <= 0) return false

    entry.count -= move
    entry.biomass -= move * DEFAULT_BIOMASS_PER_UNIT
    this.tileCounts[entry.tileIndex] = Math.max(0, (this.tileCounts[entry.tileIndex] ?? 0) - move)
    this.tileBiomass[entry.tileIndex] = Math.max(
      0,
      (this.tileBiomass[entry.tileIndex] ?? 0) - move * DEFAULT_BIOMASS_PER_UNIT,
    )

    this.addPopulation(entry.speciesId, entry.kind, destIdx, move)
    return true
  }

  getPopulationMap(): Map<string, { count: number; biomass: number }> {
    const map = new Map<string, { count: number; biomass: number }>()
    for (const entry of this.pools.values()) {
      const stats = map.get(entry.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += entry.count
      stats.biomass += entry.biomass
      map.set(entry.speciesId, stats)
    }
    return map
  }

  getSnapshot(): AggregatePopulationSnapshot {
    const speciesAggregateCounts: Record<string, number> = {}
    const topPools: AggregateEntry[] = []

    for (const entry of this.pools.values()) {
      speciesAggregateCounts[entry.speciesId] =
        (speciesAggregateCounts[entry.speciesId] ?? 0) + entry.count
      if (topPools.length < 32) {
        topPools.push({ ...entry })
      } else {
        const minIdx = topPools.reduce(
          (minI, p, i, arr) => (p.count < arr[minI].count ? i : minI),
          0,
        )
        if (entry.count > topPools[minIdx].count) {
          topPools[minIdx] = { ...entry }
        }
      }
    }

    topPools.sort((a, b) => b.count - a.count)

    return {
      totalAggregateCount: this.getTotalCount(),
      totalAggregateBiomass: this.getTotalBiomass(),
      tileAggregateCounts: [...this.tileCounts],
      tileAggregateBiomass: [...this.tileBiomass],
      speciesAggregateCounts,
      topPools,
    }
  }
}
