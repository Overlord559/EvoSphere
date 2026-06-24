import { nanoid } from 'nanoid'
import type { World } from '../../types/simulation'
import type { AgentSystem } from '../agents/AgentSystem'
import type { LifeSystem } from '../life/LifeSystem'
import { forkRng, randomInt } from '../../utils/rng'
import {
  type ActiveDisaster,
  type DisasterSeverity,
  type DisasterSnapshot,
  type DisasterType,
  ALL_DISASTER_TYPES,
  DISASTER_LABELS,
  disasterDurationTicks,
  severityFromValue,
} from './DisasterTypes'
import {
  applyTileStress,
  disasterEffectSummary,
  selectDisasterRegion,
  tileStressForDisaster,
} from './disasterEffects'

export type DisasterEventEmitter = (type: string, message: string) => void

const MAX_ACTIVE_DISASTERS = 4
const MAX_RECENT_ENDED = 6
const DISASTER_EVENT_COOLDOWN = 8

export class DisasterSystem {
  private active: ActiveDisaster[] = []
  private recentEnded: ActiveDisaster[] = []
  private tileStress = new Map<number, { biomassBurn: number; mortality: number }>()
  private lastEventTick = 0
  private readonly seed: string

  constructor(seed: string) {
    this.seed = seed
  }

  reset(): void {
    this.active = []
    this.recentEnded = []
    this.tileStress.clear()
    this.lastEventTick = 0
  }

  getSnapshot(): DisasterSnapshot {
    const stressTileIds = [...this.tileStress.keys()]
    return {
      active: this.active.map((d) => ({ ...d, affectedTileIds: [...d.affectedTileIds] })),
      recentEnded: [...this.recentEnded],
      stressTileIds,
    }
  }

  getTileMortalityPressure(tileIndex: number): number {
    return this.tileStress.get(tileIndex)?.mortality ?? 0
  }

  getTileBiomassBurn(tileIndex: number): number {
    return this.tileStress.get(tileIndex)?.biomassBurn ?? 0
  }

  injectDisaster(
    world: World,
    tick: number,
    type: DisasterType,
    severityValue: number,
    emit: DisasterEventEmitter,
  ): ActiveDisaster | null {
    if (this.active.length >= MAX_ACTIVE_DISASTERS) return null
    const severity = severityFromValue(severityValue)
    const region = selectDisasterRegion(world, `${this.seed}-${tick}-${type}`, type, severityValue)
    if (region.affectedTileIds.length === 0) return null

    const disaster: ActiveDisaster = {
      id: nanoid(),
      type,
      severity,
      severityValue,
      startTick: tick,
      durationTicks: disasterDurationTicks(type, severityValue),
      affectedTileIds: region.affectedTileIds,
      centerX: region.centerX,
      centerY: region.centerY,
      radius: region.radius,
      effectSummary: disasterEffectSummary(type, severityValue, region.affectedTileIds.length),
      lifeImpact: this.lifeImpactLabel(type, severityValue),
      agentImpact: this.agentImpactLabel(type, severityValue),
      biomeImpact: this.biomeImpactLabel(type),
    }

    this.active.push(disaster)
    this.applyDisasterToTiles(world, disaster, region.centerX, region.centerY, region.radius)
    emit(
      'disaster.started',
      `${DISASTER_LABELS[type]} began — ${disaster.effectSummary}. ${disaster.lifeImpact}`,
    )
    this.lastEventTick = tick
    return disaster
  }

  injectRandomDisaster(world: World, tick: number, emit: DisasterEventEmitter): ActiveDisaster | null {
    const rng = forkRng(this.seed, `disaster-random-${tick}`)
    const type = ALL_DISASTER_TYPES[randomInt(rng, 0, ALL_DISASTER_TYPES.length - 1)]
    const severityValue = 0.25 + rng() * 0.65
    return this.injectDisaster(world, tick, type, severityValue, emit)
  }

  tick(
    world: World,
    tick: number,
    life: LifeSystem,
    agents: AgentSystem,
    emit: DisasterEventEmitter,
    suppressMinorEvents = false,
  ): void {
    this.tileStress.clear()

    const stillActive: ActiveDisaster[] = []
    for (const disaster of this.active) {
      const elapsed = tick - disaster.startTick
      if (elapsed >= disaster.durationTicks) {
        this.endDisaster(disaster, tick, emit, suppressMinorEvents)
        continue
      }

      this.applyDisasterToTiles(
        world,
        disaster,
        disaster.centerX,
        disaster.centerY,
        disaster.radius,
      )
      this.applyLifeAgentEffects(world, disaster, life, agents, tick, emit, suppressMinorEvents)
      stillActive.push(disaster)
    }
    this.active = stillActive
  }

  private endDisaster(
    disaster: ActiveDisaster,
    tick: number,
    emit: DisasterEventEmitter,
    suppress: boolean,
  ): void {
    this.recentEnded.unshift({ ...disaster })
    if (this.recentEnded.length > MAX_RECENT_ENDED) {
      this.recentEnded.length = MAX_RECENT_ENDED
    }
    if (!suppress && tick - this.lastEventTick >= DISASTER_EVENT_COOLDOWN) {
      emit(
        'disaster.ended',
        `${DISASTER_LABELS[disaster.type]} ended after ${tick - disaster.startTick} ticks — recovery underway.`,
      )
      this.lastEventTick = tick
    }
  }

  private applyDisasterToTiles(
    world: World,
    disaster: ActiveDisaster,
    centerX: number,
    centerY: number,
    radius: number,
  ): void {
    for (const idx of disaster.affectedTileIds) {
      const tile = world.tiles[idx]
      if (!tile || tile.terrain === 'void') continue
      const d = Math.hypot(tile.x - centerX, tile.y - centerY)
      const stress = tileStressForDisaster(disaster.type, disaster.severityValue, tile, d, radius)
      applyTileStress(tile, stress)

      const prev = this.tileStress.get(idx) ?? { biomassBurn: 0, mortality: 0 }
      this.tileStress.set(idx, {
        biomassBurn: Math.max(prev.biomassBurn, stress.biomassBurn),
        mortality: Math.max(prev.mortality, stress.mortalityPressure),
      })
    }
  }

  private applyLifeAgentEffects(
    world: World,
    disaster: ActiveDisaster,
    life: LifeSystem,
    agents: AgentSystem,
    tick: number,
    emit: DisasterEventEmitter,
    suppress: boolean,
  ): void {
    let deaths = 0
    for (const idx of disaster.affectedTileIds) {
      const burn = this.tileStress.get(idx)?.biomassBurn ?? 0
      const mortality = this.tileStress.get(idx)?.mortality ?? 0
      if (burn > 0.1) {
        deaths += life.applyBiomassStress(world, idx, burn)
      }
      if (mortality > 0.15) {
        deaths += life.applyMortalityPressure(world, idx, mortality * 0.08)
        agents.applyMortalityPressure(world, idx, mortality * 0.12)
      }
    }

    if (
      !suppress &&
      deaths >= 5 &&
      tick - this.lastEventTick >= DISASTER_EVENT_COOLDOWN
    ) {
      emit(
        'disaster.mass_dieoff',
        `${DISASTER_LABELS[disaster.type]} caused ${deaths} deaths in affected regions.`,
      )
      this.lastEventTick = tick
    }

    if (
      !suppress &&
      (disaster.type === 'ice_age_pulse' || disaster.type === 'volcanic_winter') &&
      tick === disaster.startTick + Math.floor(disaster.durationTicks / 2) &&
      tick - this.lastEventTick >= DISASTER_EVENT_COOLDOWN
    ) {
      emit(
        'disaster.biome_shift',
        `${DISASTER_LABELS[disaster.type]} is shifting cold/wet biomes across ${disaster.affectedTileIds.length} tiles.`,
      )
      this.lastEventTick = tick
    }
  }

  private lifeImpactLabel(type: DisasterType, severity: number): string {
    const pct = Math.round(severity * 100)
    switch (type) {
      case 'drought':
        return `Water and fertility reduced up to ${pct}% on dry tiles.`
      case 'wildfire':
        return `Plant biomass burning in forests and grasslands.`
      case 'flood':
      case 'tsunami':
        return `Lowland life stressed by inundation.`
      case 'disease_outbreak':
        return `Dense populations face elevated mortality.`
      case 'oxygen_crash':
        return `Broad biomass decline from ecological stress.`
      default:
        return `Regional mortality pressure ~${pct}%.`
    }
  }

  private agentImpactLabel(_type: DisasterType, severity: number): string {
    if (severity < 0.4) return 'Mobile agents may migrate away from epicenter.'
    return 'Agents in affected tiles face starvation and predation disruption.'
  }

  private biomeImpactLabel(type: DisasterType): string {
    switch (type) {
      case 'ice_age_pulse':
        return 'Cold expansion into valleys; grassland → tundra where sustained.'
      case 'volcanic_winter':
        return 'Global cooling; reduced photosynthesis in high latitudes.'
      case 'flood':
        return 'Lowlands become marsh; coasts saturated.'
      case 'asteroid_impact':
        return 'Regional devastation; possible global cooling fringe.'
      default:
        return 'Temporary terrain attribute shifts on affected tiles.'
    }
  }
}

export function parseDisasterSeverityInput(value: string): number {
  switch (value) {
    case 'minor':
      return 0.3
    case 'moderate':
      return 0.55
    case 'major':
      return 0.75
    case 'catastrophic':
      return 0.95
    default:
      return 0.55
  }
}

export type { DisasterSeverity }
