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
import { findMergeCandidates, isMobileKind, isProducerKind, mergePopulationUnits } from './populationUnitOps'
import {
  formatEstimatedPopulation,
  getRepresentationScale,
  representationCompressionRatio,
  type PopulationUnitType,
} from './representationScale'

export interface PopulationUnit {
  id: string
  speciesId: string
  kind: LifeKind | AgentKind
  unitType: PopulationUnitType
  tileIndex: number
  /** Estimated biological individuals this unit represents — not entity count. */
  representedIndividuals: number
  biomass: number
  density: number
  health: number
  averageEnergy: number
  averageAge: number
  averageGeneration: number
  lastUpdatedTick: number
  displayScaleLabel: string
}

export interface PopulationUnitSnapshot {
  totalEstimatedIndividuals: number
  totalBiomass: number
  unitCount: number
  producerUnitCount: number
  mobileCohortCount: number
  averageRepresentedPerUnit: number
  largestUnitScale: number
  compressionRatio: number
  tileAggregateCounts: number[]
  tileAggregateBiomass: number[]
  speciesAggregateCounts: Record<string, number>
  topUnits: PopulationUnit[]
}

/** Representation budgets — not ecological population caps. */
export const MAX_POPULATION_UNITS_TOTAL = 1800
export const MAX_POPULATION_UNITS_PER_SPECIES = 400
export const MAX_TOP_UNITS_IN_SNAPSHOT = 32

let unitIdSeq = 0

export function resetPopulationUnitIds(): void {
  unitIdSeq = 0
}

function nextUnitId(): string {
  unitIdSeq += 1
  return `pu-${unitIdSeq}`
}

function poolKey(speciesId: string, tileIndex: number): string {
  return `${speciesId}@${tileIndex}`
}

function defaultGenomeStub() {
  return {
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
  }
}

function createUnit(
  speciesId: string,
  kind: LifeKind | AgentKind,
  tileIndex: number,
  representedIndividuals: number,
  tick: number,
): PopulationUnit {
  const scale = getRepresentationScale(kind)
  return {
    id: nextUnitId(),
    speciesId,
    kind,
    unitType: scale.unitType,
    tileIndex,
    representedIndividuals,
    biomass: representedIndividuals * scale.biomassPerIndividual,
    density: Math.min(1, representedIndividuals / scale.individualsPerUnit),
    health: 0.85,
    averageEnergy: 0.6,
    averageAge: 10,
    averageGeneration: 1,
    lastUpdatedTick: tick,
    displayScaleLabel: scale.displayScaleLabel,
  }
}

/**
 * Bounded cohort/patch/bloom store — biological population scales via representedIndividuals,
 * not record count.
 */
export class PopulationUnitStore {
  private units = new Map<string, PopulationUnit>()
  private tileCounts: number[] = []
  private tileBiomass: number[] = []

  init(world: World): void {
    const size = world.width * world.height
    this.tileCounts = new Array(size).fill(0)
    this.tileBiomass = new Array(size).fill(0)
  }

  clear(): void {
    this.units.clear()
    if (this.tileCounts.length > 0) {
      this.tileCounts.fill(0)
      this.tileBiomass.fill(0)
    }
    resetPopulationUnitIds()
  }

  getUnitCount(): number {
    return this.units.size
  }

  /** Sum of representedIndividuals across all units (estimated biological population). */
  getTotalCount(): number {
    let total = 0
    for (const unit of this.units.values()) {
      total += unit.representedIndividuals
    }
    return Math.round(total)
  }

  getTotalBiomass(): number {
    let total = 0
    for (const unit of this.units.values()) {
      total += unit.biomass
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
    for (const unit of this.units.values()) {
      if (unit.speciesId === speciesId) count += unit.representedIndividuals
    }
    return count
  }

  getSpeciesUnitCount(speciesId: string): number {
    let count = 0
    for (const unit of this.units.values()) {
      if (unit.speciesId === speciesId) count += 1
    }
    return count
  }

  /**
   * Add biological population to cohort/patch units.
   * @param biologicalEvents — number of reproduction/reserve events (default 1); scaled by species policy.
   */
  addPopulation(
    speciesId: string,
    kind: LifeKind | AgentKind,
    tileIndex: number,
    biologicalEvents = 1,
    tick = 0,
  ): number {
    if (biologicalEvents <= 0) return 0

    const scale = getRepresentationScale(kind)
    const addIndividuals = scale.individualsPerBirth * biologicalEvents

    if (this.units.size >= MAX_POPULATION_UNITS_TOTAL) {
      this.enforceUnitBudget(192)
      if (this.units.size >= MAX_POPULATION_UNITS_TOTAL) {
        const key = poolKey(speciesId, tileIndex)
        const existing = this.units.get(key)
        if (existing) {
          existing.representedIndividuals += addIndividuals
          existing.biomass += addIndividuals * scale.biomassPerIndividual
          existing.density = Math.min(1, existing.representedIndividuals / scale.individualsPerUnit)
          existing.lastUpdatedTick = tick
          this.rebuildTileTotals()
          return addIndividuals
        }
        return 0
      }
    }

    if (this.getSpeciesUnitCount(speciesId) >= MAX_POPULATION_UNITS_PER_SPECIES) {
      this.mergeSpeciesUnits(speciesId, 192)
    }

    const key = poolKey(speciesId, tileIndex)
    const existing = this.units.get(key)
    if (existing) {
      existing.representedIndividuals += addIndividuals
      existing.biomass += addIndividuals * scale.biomassPerIndividual
      existing.density = Math.min(1, existing.representedIndividuals / scale.individualsPerUnit)
      existing.lastUpdatedTick = tick
    } else {
      this.units.set(key, createUnit(speciesId, kind, tileIndex, addIndividuals, tick))
    }

    this.rebuildTileTotals()
    return addIndividuals
  }

  consumeBiomassAt(tileIndex: number, amount: number): number {
    let remaining = amount
    let consumed = 0

    for (const [key, unit] of this.units) {
      if (unit.tileIndex !== tileIndex || remaining <= 0) continue
      const take = Math.min(remaining, unit.biomass * 0.35, unit.biomass)
      if (take <= 0.01) continue

      const scale = getRepresentationScale(unit.kind)
      unit.biomass = Math.max(0.02, unit.biomass - take)
      const individualsLost = Math.min(
        unit.representedIndividuals,
        Math.ceil(take / scale.biomassPerIndividual),
      )
      unit.representedIndividuals = Math.max(0, unit.representedIndividuals - individualsLost)
      remaining -= take
      consumed += take

      if (unit.representedIndividuals <= 0) this.units.delete(key)
    }

    if (consumed > 0) this.rebuildTileTotals()
    return consumed
  }

  tickProducerGrowth(
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    dispersalBoost = 1,
    tick = 0,
  ): { growth: number; dispersals: number } {
    let growth = 0
    let dispersals = 0

    for (const [key, unit] of [...this.units.entries()]) {
      if (!isProducerKind(unit.kind)) continue

      const x = unit.tileIndex % world.width
      const y = Math.floor(unit.tileIndex / world.width)
      const tile = getTileAt(world, x, y)
      if (!tile) continue

      const scale = getRepresentationScale(unit.kind)
      const trackedOnTile = ctx.tileCounts?.[unit.tileIndex] ?? 0
      const occupancyUnits = unit.representedIndividuals / scale.individualsPerUnit + trackedOnTile
      const cap = getTileCarryingCapacity(tile, unit.kind, ctx)
      if (cap <= 0) continue

      const crowding = getCrowdingPressure(tile, unit.kind, occupancyUnits, ctx)
      if (crowding >= 0.98) {
        if (this.tryDispersal(unit, world, ctx, rng, dispersalBoost, tick)) dispersals += 1
        continue
      }

      const suit = habitatSuitability(unit.kind, tile, defaultGenomeStub())
      const room = Math.max(0, cap - occupancyUnits)
      const growthIndividuals = Math.min(
        scale.maxGrowthPerTick,
        room * suit * (1 - crowding * 0.7) * scale.individualsPerBirth * 0.02,
      )
      const add = Math.min(
        Math.floor(growthIndividuals + rng() * scale.individualsPerBirth),
        room,
        scale.maxGrowthPerTick,
      )
      if (add <= 0) continue

      unit.representedIndividuals += add
      unit.biomass += add * scale.biomassPerIndividual
      unit.density = Math.min(1, unit.representedIndividuals / scale.individualsPerUnit)
      unit.lastUpdatedTick = tick
      growth += add

      if (unit.representedIndividuals <= 0) this.units.delete(key)
      void key
    }

    if (growth > 0 || dispersals > 0) {
      this.enforceUnitBudget(world.width)
      this.rebuildTileTotals()
    }

    return { growth, dispersals }
  }

  tickMobileReserve(
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    reproductionBoost = 1,
    tick = 0,
  ): { births: number; deaths: number } {
    let births = 0
    let deaths = 0

    for (const [key, unit] of [...this.units.entries()]) {
      if (!isMobileKind(unit.kind)) continue

      const x = unit.tileIndex % world.width
      const y = Math.floor(unit.tileIndex / world.width)
      const tile = getTileAt(world, x, y)
      if (!tile) continue

      const scale = getRepresentationScale(unit.kind)
      const cap = getTileCarryingCapacity(tile, unit.kind, ctx)
      const occupancyUnits = unit.representedIndividuals / scale.individualsPerUnit
      const crowding = cap > 0 ? occupancyUnits / cap : 1

      if (crowding > 0.95 && rng() > 0.7) {
        const loss = Math.min(scale.maxGrowthPerTick, Math.floor(unit.representedIndividuals * 0.02))
        unit.representedIndividuals -= loss
        unit.biomass -= loss * scale.biomassPerIndividual
        deaths += loss
      } else if (crowding < 0.75 && rng() < 0.08 * reproductionBoost) {
        const birth = Math.min(scale.maxGrowthPerTick, Math.floor((1 - crowding) * scale.individualsPerBirth))
        unit.representedIndividuals += birth
        unit.biomass += birth * scale.biomassPerIndividual
        births += birth
      }

      unit.lastUpdatedTick = tick
      if (unit.representedIndividuals <= 0) this.units.delete(key)
      void key
    }

    if (births > 0 || deaths > 0) {
      this.enforceUnitBudget(world.width)
      this.rebuildTileTotals()
    }

    return { births, deaths }
  }

  private tryDispersal(
    unit: PopulationUnit,
    world: World,
    ctx: CarryingCapacityContext,
    rng: Rng,
    dispersalBoost: number,
    tick: number,
  ): boolean {
    const scale = getRepresentationScale(unit.kind)
    if (unit.representedIndividuals < scale.individualsPerUnit * 0.5 && rng() > 0.12 * dispersalBoost) {
      return false
    }
    if (rng() > 0.12 * dispersalBoost) return false

    const srcX = unit.tileIndex % world.width
    const srcY = Math.floor(unit.tileIndex / world.width)
    const neighbors = neighborOffsets()
      .map(([dx, dy]) => ({ x: srcX + dx, y: srcY + dy }))
      .filter(({ x, y }) => isTileActive(world, x, y))

    if (neighbors.length === 0) return false

    const target = neighbors[Math.floor(rng() * neighbors.length)]
    const tile = getTileAt(world, target.x, target.y)
    if (!tile) return false

    const destIdx = target.y * world.width + target.x
    const cap = getTileCarryingCapacity(tile, unit.kind as LifeKind, ctx)
    const destScale = getRepresentationScale(unit.kind)
    const occ =
      (ctx.tileCounts?.[destIdx] ?? 0) +
      (ctx.tileAgentCounts?.[destIdx] ?? 0) +
      this.getTileCount(destIdx) / destScale.individualsPerUnit
    if (cap <= 0 || occ >= cap) return false

    const moveIndividuals = Math.min(scale.maxGrowthPerTick * 2, Math.floor(unit.representedIndividuals * 0.08))
    if (moveIndividuals <= 0) return false

    unit.representedIndividuals -= moveIndividuals
    unit.biomass -= moveIndividuals * scale.biomassPerIndividual
    const destKey = poolKey(unit.speciesId, destIdx)
    const destExisting = this.units.get(destKey)
    if (destExisting) {
      destExisting.representedIndividuals += moveIndividuals
      destExisting.biomass += moveIndividuals * scale.biomassPerIndividual
      destExisting.density = Math.min(1, destExisting.representedIndividuals / scale.individualsPerUnit)
      destExisting.lastUpdatedTick = tick
    } else if (this.units.size < MAX_POPULATION_UNITS_TOTAL) {
      this.units.set(destKey, createUnit(unit.speciesId, unit.kind, destIdx, moveIndividuals, tick))
    } else {
      unit.representedIndividuals += moveIndividuals
      unit.biomass += moveIndividuals * scale.biomassPerIndividual
      return false
    }
    unit.lastUpdatedTick = tick
    return true
  }

  private enforceUnitBudget(worldWidth: number): void {
    while (this.units.size > MAX_POPULATION_UNITS_TOTAL) {
      const candidates = findMergeCandidates(this.units, worldWidth)
      if (candidates.length === 0) break

      const { keyA, keyB } = candidates[0]
      const a = this.units.get(keyA)
      const b = this.units.get(keyB)
      if (!a || !b) continue

      const merged = mergePopulationUnits(a, b)
      this.units.set(keyA, merged)
      this.units.delete(keyB)
    }
  }

  private mergeSpeciesUnits(speciesId: string, worldWidth: number): void {
    const speciesUnits = [...this.units.entries()].filter(([, u]) => u.speciesId === speciesId)
    if (speciesUnits.length < 2) return

    const subset = new Map(speciesUnits)
    const candidates = findMergeCandidates(subset, worldWidth, 3)
    if (candidates.length === 0) return

    const { keyA, keyB } = candidates[0]
    const a = this.units.get(keyA)
    const b = this.units.get(keyB)
    if (!a || !b) return

    this.units.set(keyA, mergePopulationUnits(a, b))
    this.units.delete(keyB)
  }

  private rebuildTileTotals(): void {
    this.tileCounts.fill(0)
    this.tileBiomass.fill(0)
    for (const unit of this.units.values()) {
      const scale = getRepresentationScale(unit.kind)
      const ecologicalUnits = unit.representedIndividuals / scale.individualsPerUnit
      this.tileCounts[unit.tileIndex] = (this.tileCounts[unit.tileIndex] ?? 0) + ecologicalUnits
      this.tileBiomass[unit.tileIndex] = (this.tileBiomass[unit.tileIndex] ?? 0) + unit.biomass
    }
  }

  getPopulationMap(): Map<string, { count: number; biomass: number }> {
    const map = new Map<string, { count: number; biomass: number }>()
    for (const unit of this.units.values()) {
      const stats = map.get(unit.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += unit.representedIndividuals
      stats.biomass += unit.biomass
      map.set(unit.speciesId, stats)
    }
    return map
  }

  getUnitsForTile(tileIndex: number, limit = 8): PopulationUnit[] {
    const units: PopulationUnit[] = []
    for (const unit of this.units.values()) {
      if (unit.tileIndex === tileIndex) units.push(unit)
    }
    return units.sort((a, b) => b.representedIndividuals - a.representedIndividuals).slice(0, limit)
  }

  getSnapshot(): PopulationUnitSnapshot {
    const speciesAggregateCounts: Record<string, number> = {}
    const topUnits: PopulationUnit[] = []
    let producerUnitCount = 0
    let mobileCohortCount = 0
    let largestUnitScale = 0

    for (const unit of this.units.values()) {
      speciesAggregateCounts[unit.speciesId] =
        (speciesAggregateCounts[unit.speciesId] ?? 0) + unit.representedIndividuals
      if (isProducerKind(unit.kind)) producerUnitCount += 1
      else mobileCohortCount += 1
      if (unit.representedIndividuals > largestUnitScale) {
        largestUnitScale = unit.representedIndividuals
      }

      if (topUnits.length < MAX_TOP_UNITS_IN_SNAPSHOT) {
        topUnits.push({ ...unit })
      } else {
        const minIdx = topUnits.reduce(
          (minI, p, i, arr) => (p.representedIndividuals < arr[minI].representedIndividuals ? i : minI),
          0,
        )
        if (unit.representedIndividuals > topUnits[minIdx].representedIndividuals) {
          topUnits[minIdx] = { ...unit }
        }
      }
    }

    topUnits.sort((a, b) => b.representedIndividuals - a.representedIndividuals)

    const totalEstimated = this.getTotalCount()
    const unitCount = this.units.size

    return {
      totalEstimatedIndividuals: totalEstimated,
      totalBiomass: this.getTotalBiomass(),
      unitCount,
      producerUnitCount,
      mobileCohortCount,
      averageRepresentedPerUnit: unitCount > 0 ? Math.round(totalEstimated / unitCount) : 0,
      largestUnitScale,
      compressionRatio: representationCompressionRatio(totalEstimated, unitCount),
      tileAggregateCounts: this.tileCounts,
      tileAggregateBiomass: this.tileBiomass,
      speciesAggregateCounts,
      topUnits,
    }
  }

  getAllUnits(): PopulationUnit[] {
    return [...this.units.values()]
  }

  /** Legacy alias for aggregate pool count in telemetry. */
  getPoolCount(): number {
    return this.units.size
  }
}

/** @deprecated Use PopulationUnitStore — kept for import compatibility. */
export type AggregateEntry = PopulationUnit

/** @deprecated Use PopulationUnitSnapshot */
export type AggregatePopulationSnapshot = PopulationUnitSnapshot

/** @deprecated Use PopulationUnitStore */
export { PopulationUnitStore as AggregatePopulationStore }

export { formatEstimatedPopulation, representationCompressionRatio }
