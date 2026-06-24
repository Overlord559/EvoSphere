import { nanoid } from 'nanoid'
import type {
  EventLogEntry,
  SimulationSettings,
  SimulationSnapshot,
  World,
} from '../../types/simulation'
import type { DeepTimeSummary } from '../../types/runtime'
import { LifeSystem } from '../life/LifeSystem'
import { generateWorld } from '../world/generateWorld'
import { buildBriefing } from './briefing'
import { tickToYears, yearsToTicks } from './simTime'

const TICK_EVENT_INTERVAL = 500
const DEEP_TIME_CHUNK_SIZE = 250

export interface DeepTimeCapture {
  startSnap: ReturnType<LifeSystem['getSnapshot']>
  startTileCounts: number[]
  startColonized: number
  startDominant: string | null
  preSpeciesNames: Map<string, string>
  startTick: number
  startYear: number
}

export class SimEngine {
  private tick = 0
  private world: World
  private settings: SimulationSettings
  private readonly events: EventLogEntry[] = []
  private readonly life: LifeSystem
  private lastDeepTimeSummary: DeepTimeSummary | null = null
  private speciesPopBeforeStep = new Map<string, number>()

  constructor(settings: SimulationSettings) {
    this.settings = { ...settings }
    this.world = generateWorld(this.settings)
    this.life = new LifeSystem(this.settings.seed, this.world)
    this.emitEvent(
      'world.generated',
      `World generated from seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
    this.life.seedInitialLife(this.world, (type, message) => this.emitEvent(type, message))
    this.captureSpeciesPopBefore()
  }

  step(count = 1, suppressMinorEvents = false): void {
    for (let i = 0; i < count; i++) {
      this.tick += 1
      this.world = { ...this.world, tick: this.tick }
      this.life.tick(this.world, this.tick, (type, message) => this.emitEvent(type, message), suppressMinorEvents)

      if (this.tick % TICK_EVENT_INTERVAL === 0) {
        const lifeSnap = this.life.getSnapshot()
        const aliveSpecies = lifeSnap.species.filter((s) => s.population > 0).length
        this.emitEvent(
          'world.tick',
          `Tick ${this.tick} (~${tickToYears(this.tick)} yr) — ${lifeSnap.totalOrganisms} organisms, ${lifeSnap.totalBiomass.toFixed(1)} biomass, ${aliveSpecies} species`,
        )
      }
    }
    this.captureSpeciesPopBefore()
  }

  startDeepTimeCapture(): DeepTimeCapture {
    const startSnap = this.life.getSnapshot()
    return {
      startSnap,
      startTileCounts: [...startSnap.tileCounts],
      startColonized: this.life.getColonizedTileCount(),
      startDominant: startSnap.species.find((s) => s.population > 0)?.name ?? null,
      preSpeciesNames: new Map(
        startSnap.species.filter((s) => s.population > 0).map((s) => [s.id, s.name]),
      ),
      startTick: this.tick,
      startYear: tickToYears(this.tick),
    }
  }

  finalizeDeepTime(capture: DeepTimeCapture): DeepTimeSummary {
    const endSnap = this.life.getSnapshot()
    const endColonized = this.life.getColonizedTileCount()
    const endDominant = endSnap.species.find((s) => s.population > 0)?.name ?? null
    const changedTiles = this.life.countChangedTiles(capture.startTileCounts)

    const extinctions: string[] = []
    const newSpecies: string[] = []
    for (const species of endSnap.species) {
      if (species.population === 0 && capture.preSpeciesNames.has(species.id)) {
        extinctions.push(species.name)
      }
      if (species.population > 0 && !capture.preSpeciesNames.has(species.id)) {
        newSpecies.push(species.name)
      }
    }

    const summary: DeepTimeSummary = {
      startTick: capture.startTick,
      endTick: this.tick,
      startYear: capture.startYear,
      endYear: tickToYears(this.tick),
      startOrganisms: capture.startSnap.totalOrganisms,
      endOrganisms: endSnap.totalOrganisms,
      organismDelta: endSnap.totalOrganisms - capture.startSnap.totalOrganisms,
      startBiomass: capture.startSnap.totalBiomass,
      endBiomass: endSnap.totalBiomass,
      biomassDelta: endSnap.totalBiomass - capture.startSnap.totalBiomass,
      startSpecies: capture.startSnap.species.filter((s) => s.population > 0).length,
      endSpecies: endSnap.species.filter((s) => s.population > 0).length,
      speciesDelta:
        endSnap.species.filter((s) => s.population > 0).length -
        capture.startSnap.species.filter((s) => s.population > 0).length,
      extinctions,
      newSpecies,
      dominantSpeciesBefore: capture.startDominant,
      dominantSpeciesAfter: endDominant,
      majorDieOffs: endSnap.totalOrganisms < capture.startSnap.totalOrganisms * 0.7 ? 1 : 0,
      majorBlooms: endSnap.totalOrganisms > capture.startSnap.totalOrganisms * 1.5 ? 1 : 0,
      colonizedTilesBefore: capture.startColonized,
      colonizedTilesAfter: endColonized,
      colonizedTilesDelta: endColonized - capture.startColonized,
      changedTilesCount: changedTiles,
    }

    this.lastDeepTimeSummary = summary
    this.emitDeepTimeSummary(summary)
    this.life.clearRecentActivity()
    return summary
  }

  runDeepTimeTicks(totalTicks: number): DeepTimeSummary {
    const capture = this.startDeepTimeCapture()

    let remaining = totalTicks
    while (remaining > 0) {
      const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
      this.step(chunk, true)
      remaining -= chunk
    }

    return this.finalizeDeepTime(capture)
  }

  runDeepTimeYears(years: number): DeepTimeSummary {
    return this.runDeepTimeTicks(yearsToTicks(years))
  }

  reset(overrides?: Partial<SimulationSettings>): void {
    this.tick = 0
    this.events.length = 0
    this.lastDeepTimeSummary = null
    this.settings = { ...this.settings, ...overrides }
    this.world = generateWorld(this.settings)
    this.life.reset(this.world, (type, message) => this.emitEvent(type, message))
    this.emitEvent(
      'world.reset',
      `World reset with seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
    this.captureSpeciesPopBefore()
  }

  getSettings(): SimulationSettings {
    return { ...this.settings }
  }

  getWorld(): World {
    return this.world
  }

  getLastDeepTimeSummary(): DeepTimeSummary | null {
    return this.lastDeepTimeSummary
  }

  getRecentActivityTileIndices(): number[] {
    return this.life.getRecentActivityTiles()
  }

  getSnapshot(): SimulationSnapshot {
    const life = this.life.getSnapshot()
    const briefing = buildBriefing(
      this.tick,
      life,
      this.events,
      this.lastDeepTimeSummary,
      this.speciesPopBeforeStep,
    )
    return {
      tick: this.tick,
      worldId: this.world.id,
      world: this.world,
      events: [...this.events],
      life,
      briefing,
      lastDeepTimeSummary: this.lastDeepTimeSummary,
    }
  }

  private captureSpeciesPopBefore(): void {
    this.speciesPopBeforeStep = this.life.getSpeciesPopHistory()
  }

  private emitDeepTimeSummary(summary: DeepTimeSummary): void {
    const parts = [
      `${summary.startYear} → ${summary.endYear} yr`,
      `organisms ${summary.startOrganisms} → ${summary.endOrganisms} (${summary.organismDelta >= 0 ? '+' : ''}${summary.organismDelta})`,
      `species ${summary.startSpecies} → ${summary.endSpecies}`,
      `${summary.colonizedTilesDelta >= 0 ? '+' : ''}${summary.colonizedTilesDelta} colonized tiles`,
      `${summary.changedTilesCount} tiles changed`,
    ]
    if (summary.newSpecies.length > 0) {
      parts.push(`new: ${summary.newSpecies.slice(0, 3).join(', ')}`)
    }
    if (summary.extinctions.length > 0) {
      parts.push(`extinct: ${summary.extinctions.slice(0, 3).join(', ')}`)
    }
    if (summary.dominantSpeciesBefore !== summary.dominantSpeciesAfter) {
      parts.push(`dominant: ${summary.dominantSpeciesBefore ?? 'none'} → ${summary.dominantSpeciesAfter ?? 'none'}`)
    }

    this.emitEvent('world.deep_time_summary', `Deep time — ${parts.join(' · ')}`)
  }

  private emitEvent(type: string, message: string): void {
    this.events.unshift({
      id: nanoid(),
      tick: this.tick,
      type,
      message,
      timestamp: Date.now(),
    })
    if (this.events.length > 200) {
      this.events.length = 200
    }
  }
}

export { TICK_EVENT_INTERVAL, DEEP_TIME_CHUNK_SIZE }
