import { nanoid } from 'nanoid'
import type { World } from '../../types/simulation'
import type { AgentSystem } from '../agents/AgentSystem'
import type { LifeSystem } from '../life/LifeSystem'
import { forkRng, randomInt } from '../../utils/rng'
import {
  DEFAULT_DISASTER_SETTINGS,
  GLOBAL_DISASTER_TYPES,
  MASS_EXTINCTION_TYPES,
  type DisasterSettings,
  massExtinctionChanceMultiplier,
  naturalDisasterChancePer1kTicks,
} from '../config/disasterConfig'
import { tickToYears } from '../engine/simTime'
import { addTileDisturbance } from '../ecology/succession'
import { isRefugiaTile } from '../evolution/bottleneckRecovery'
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

const MAX_RECENT_ENDED = 6
const DISASTER_EVENT_COOLDOWN = 8

const NON_GLOBAL_TYPES = ALL_DISASTER_TYPES.filter((t) => !GLOBAL_DISASTER_TYPES.has(t))

export class DisasterSystem {
  private active: ActiveDisaster[] = []
  private recentEnded: ActiveDisaster[] = []
  private tileStress = new Map<number, { biomassBurn: number; mortality: number }>()
  private lastEventTick = 0
  private lastMajorDisasterYear = 0
  private lastMassExtinctionYear = 0
  private settings: DisasterSettings
  private readonly seed: string

  constructor(seed: string, settings: DisasterSettings = DEFAULT_DISASTER_SETTINGS) {
    this.seed = seed
    this.settings = { ...settings }
  }

  getSettings(): DisasterSettings {
    return { ...this.settings }
  }

  setSettings(partial: Partial<DisasterSettings>): void {
    this.settings = { ...this.settings, ...partial }
  }

  reset(): void {
    this.active = []
    this.recentEnded = []
    this.tileStress.clear()
    this.lastEventTick = 0
    this.lastMajorDisasterYear = 0
    this.lastMassExtinctionYear = 0
  }

  getSnapshot(): DisasterSnapshot {
    const stressTileIds = [...this.tileStress.keys()]
    return {
      active: this.active.map((d) => ({ ...d, affectedTileIds: [...d.affectedTileIds] })),
      recentEnded: [...this.recentEnded],
      stressTileIds,
      settings: this.getSettings(),
      lastMajorDisasterYear: this.lastMajorDisasterYear,
      lastMassExtinctionYear: this.lastMassExtinctionYear,
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
    manual = true,
  ): ActiveDisaster | null {
    if (this.active.length >= this.settings.maximumActiveDisasters) return null

    let cappedSeverity = severityValue
    if (!manual && this.settings.disasterSafeMode) {
      cappedSeverity = Math.min(cappedSeverity, 0.72)
    }
    if (!manual && MASS_EXTINCTION_TYPES.has(type) && this.settings.massExtinctionFrequency === 'very_rare') {
      cappedSeverity = Math.min(cappedSeverity, 0.55)
    }

    const severity = severityFromValue(cappedSeverity)
    const region = selectDisasterRegion(world, `${this.seed}-${tick}-${type}`, type, cappedSeverity)
    if (region.affectedTileIds.length === 0) return null

    const disaster: ActiveDisaster = {
      id: nanoid(),
      type,
      severity,
      severityValue: cappedSeverity,
      startTick: tick,
      durationTicks: disasterDurationTicks(type, cappedSeverity),
      affectedTileIds: region.affectedTileIds,
      centerX: region.centerX,
      centerY: region.centerY,
      radius: region.radius,
      effectSummary: disasterEffectSummary(type, cappedSeverity, region.affectedTileIds.length),
      lifeImpact: this.lifeImpactLabel(type, cappedSeverity),
      agentImpact: this.agentImpactLabel(type, cappedSeverity),
      biomeImpact: this.biomeImpactLabel(type),
    }

    this.active.push(disaster)
    this.applyDisasterToTiles(world, disaster, region.centerX, region.centerY, region.radius)
    emit(
      'disaster.started',
      `${DISASTER_LABELS[type]} began — ${disaster.effectSummary}. ${disaster.lifeImpact}`,
    )
    this.lastEventTick = tick
    const yr = tickToYears(tick)
    if (cappedSeverity >= 0.55) this.lastMajorDisasterYear = yr
    if (MASS_EXTINCTION_TYPES.has(type)) this.lastMassExtinctionYear = yr
    return disaster
  }

  injectRandomDisaster(world: World, tick: number, emit: DisasterEventEmitter): ActiveDisaster | null {
    const rng = forkRng(this.seed, `disaster-random-${tick}`)
    const type = ALL_DISASTER_TYPES[randomInt(rng, 0, ALL_DISASTER_TYPES.length - 1)]
    const severityValue = 0.25 + rng() * 0.65
    return this.injectDisaster(world, tick, type, severityValue, emit, true)
  }

  /** Natural disaster roll — rare by default, era-scaled, cooldown-guarded. */
  maybeTriggerNaturalDisaster(
    world: World,
    tick: number,
    worldAgeYears: number,
    emit: DisasterEventEmitter,
    suppressMinorEvents = false,
  ): void {
    if (!this.settings.disasterEnabled) return
    if (this.settings.naturalDisasterFrequency === 'manual_only') return
    if (this.active.length >= this.settings.maximumActiveDisasters) return

    const rng = forkRng(this.seed, `natural-disaster-${tick}`)
    const baseChance = naturalDisasterChancePer1kTicks(this.settings.naturalDisasterFrequency)

    // Early life protection — fewer severe events in first 200 years
    const earlyLifeFactor = worldAgeYears < 200 ? 0.35 : worldAgeYears < 500 ? 0.65 : 1

    const majorCooldownOk =
      worldAgeYears - this.lastMajorDisasterYear >= this.settings.minimumYearsBetweenMajorDisasters
    const massCooldownOk =
      worldAgeYears - this.lastMassExtinctionYear >= this.settings.minimumYearsBetweenMassExtinctions

    if (rng() > baseChance * earlyLifeFactor) return

    let type: DisasterType
    let severityValue = 0.22 + rng() * 0.45

    const massRoll = rng() * massExtinctionChanceMultiplier(this.settings.massExtinctionFrequency)
    if (massRoll > 0.92 && massCooldownOk && worldAgeYears > 300) {
      type = MASS_EXTINCTION_TYPES.has('asteroid_impact')
        ? 'asteroid_impact'
        : (['volcanic_winter', 'ice_age_pulse', 'oxygen_crash'] as DisasterType[])[
            randomInt(rng, 0, 2)
          ]
      severityValue = this.settings.disasterSafeMode ? 0.5 + rng() * 0.25 : 0.65 + rng() * 0.3
    } else {
      type = NON_GLOBAL_TYPES[randomInt(rng, 0, NON_GLOBAL_TYPES.length - 1)] ?? 'storm'
      if (!majorCooldownOk) severityValue = Math.min(severityValue, 0.42)
    }

    if (this.settings.disasterSafeMode) {
      severityValue = Math.min(severityValue, 0.68)
    }

    if (!suppressMinorEvents) {
      this.injectDisaster(world, tick, type, severityValue, emit, false)
    }
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

    if (tick % 1000 === 0 && !suppressMinorEvents) {
      this.maybeTriggerNaturalDisaster(world, tick, tickToYears(tick), emit, suppressMinorEvents)
    }

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

      if (this.settings.disasterSafeMode && isRefugiaTile(world, idx)) {
        const d = Math.hypot(tile.x - centerX, tile.y - centerY)
        const stress = tileStressForDisaster(disaster.type, disaster.severityValue * 0.35, tile, d, radius)
        applyTileStress(tile, stress)
        addTileDisturbance(world, idx, stress.mortalityPressure * 0.15)
        const prev = this.tileStress.get(idx) ?? { biomassBurn: 0, mortality: 0 }
        this.tileStress.set(idx, {
          biomassBurn: Math.max(prev.biomassBurn, stress.biomassBurn * 0.4),
          mortality: Math.max(prev.mortality, stress.mortalityPressure * 0.35),
        })
        continue
      }

      const d = Math.hypot(tile.x - centerX, tile.y - centerY)
      const stress = tileStressForDisaster(disaster.type, disaster.severityValue, tile, d, radius)
      applyTileStress(tile, stress)
      addTileDisturbance(world, idx, stress.mortalityPressure * 0.25 + stress.biomassBurn * 0.1)

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
    let refugiaSurvived = 0
    for (const idx of disaster.affectedTileIds) {
      const burn = this.tileStress.get(idx)?.biomassBurn ?? 0
      let mortality = this.tileStress.get(idx)?.mortality ?? 0

      if (this.settings.disasterSafeMode && isRefugiaTile(world, idx)) {
        mortality *= 0.35
        refugiaSurvived += 1
      }

      // Never wipe all life unless catastrophic manual injection
      if (this.settings.disasterSafeMode && disaster.severityValue < 0.85) {
        mortality = Math.min(mortality, 0.55)
      }

      if (burn > 0.1) {
        deaths += life.applyBiomassStress(world, idx, burn)
      }
      if (mortality > 0.15) {
        deaths += life.applyMortalityPressure(world, idx, mortality * 0.08)
        agents.applyMortalityPressure(world, idx, mortality * 0.12)
      }
    }

    if (!suppress && refugiaSurvived > 0 && tick - this.lastEventTick >= DISASTER_EVENT_COOLDOWN) {
      emit(
        'evolution.refugia_survived',
        `${refugiaSurvived} refugia tiles preserved life during ${DISASTER_LABELS[disaster.type]} (safe mode).`,
      )
      this.lastEventTick = tick
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
        return `Plant biomass burning in forest/grassland ecosystems.`
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
        return 'Cold expansion into valleys; succession may regress.'
      case 'volcanic_winter':
        return 'Global cooling; reduced photosynthesis in high latitudes.'
      case 'flood':
        return 'Lowlands saturated; marsh succession may advance when biomass returns.'
      case 'asteroid_impact':
        return 'Regional devastation; refugia may preserve lineages in safe mode.'
      default:
        return 'Temporary terrain attribute shifts; ecological succession may regress.'
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
