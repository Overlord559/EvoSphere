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
/** Internal ticks per deep-time batch step (no UI sync between sub-steps). */
const DEEP_TIME_CHUNK_SIZE = 5000
/** How often the UI receives a snapshot during deep-time (ms). */
const DEEP_TIME_UI_SYNC_MS = 120

export interface DeepTimeCapture {
  startSnap: ReturnType<LifeSystem['getSnapshot']>
  startTileCounts: number[]
  startColonized: number
  startDominant: string | null
  preSpeciesNames: Map<string, string>
  preSpeciesPopulations: Map<string, number>
  startTick: number
  startYear: number
  selectedSpeciesId: string | null
  selectedSpeciesName: string | null
  selectedSpeciesPopBefore: number | null
  runtimeStartMs: number
}

export class SimEngine {
  private tick = 0
  private world: World
  private settings: SimulationSettings
  private readonly events: EventLogEntry[] = []
  private readonly life: LifeSystem
  private lastDeepTimeSummary: DeepTimeSummary | null = null
  private speciesPopBeforeStep = new Map<string, number>()
  private deepTimeMode = false

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
      this.world.tick = this.tick
      this.life.tick(this.world, this.tick, (type, message) => this.emitEvent(type, message), suppressMinorEvents)

      if (!this.deepTimeMode && this.tick % TICK_EVENT_INTERVAL === 0) {
        const lifeSnap = this.life.getSnapshot(false)
        const aliveSpecies = lifeSnap.species.filter((s) => s.population > 0).length
        this.emitEvent(
          'world.tick',
          `Tick ${this.tick} (~${tickToYears(this.tick)} yr) — ${lifeSnap.totalOrganisms} organisms, ${lifeSnap.totalBiomass.toFixed(1)} biomass, ${aliveSpecies} species`,
        )
      }
    }
    this.captureSpeciesPopBefore()
  }

  /** Fast batched stepping for deep-time — skips periodic world.tick events. */
  stepDeepTimeBatch(tickCount: number): void {
    this.deepTimeMode = true
    this.tick = this.life.tickBatch(this.world, this.tick, tickCount)
    this.world.tick = this.tick
    this.deepTimeMode = false
    this.captureSpeciesPopBefore()
  }

  startDeepTimeCapture(selectedSpeciesId: string | null = null): DeepTimeCapture {
    const startSnap = this.life.getSnapshot(false)
    const selectedRecord = selectedSpeciesId
      ? startSnap.species.find((s) => s.id === selectedSpeciesId)
      : undefined

    return {
      startSnap,
      startTileCounts: [...startSnap.tileCounts],
      startColonized: this.life.getColonizedTileCount(),
      startDominant: startSnap.species.find((s) => s.population > 0)?.name ?? null,
      preSpeciesNames: new Map(
        startSnap.species.filter((s) => s.population > 0).map((s) => [s.id, s.name]),
      ),
      preSpeciesPopulations: new Map(
        startSnap.species.map((s) => [s.id, s.population]),
      ),
      startTick: this.tick,
      startYear: tickToYears(this.tick),
      selectedSpeciesId,
      selectedSpeciesName: selectedRecord?.name ?? null,
      selectedSpeciesPopBefore: selectedRecord?.population ?? null,
      runtimeStartMs: performance.now(),
    }
  }

  finalizeDeepTime(capture: DeepTimeCapture): DeepTimeSummary {
    const endSnap = this.life.getSnapshot(false)
    const endColonized = this.life.getColonizedTileCount()
    const endDominant = endSnap.species.find((s) => s.population > 0)?.name ?? null
    const changedTiles = this.life.countChangedTiles(capture.startTileCounts)
    const runtimeSeconds = (performance.now() - capture.runtimeStartMs) / 1000

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

    let selectedSpeciesPopAfter: number | null = null
    let selectedSpeciesPopDelta: number | null = null
    if (capture.selectedSpeciesId) {
      const after = endSnap.species.find((s) => s.id === capture.selectedSpeciesId)
      selectedSpeciesPopAfter = after?.population ?? 0
      if (capture.selectedSpeciesPopBefore !== null) {
        selectedSpeciesPopDelta = selectedSpeciesPopAfter - capture.selectedSpeciesPopBefore
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
      elapsedSimYears: tickToYears(this.tick) - capture.startYear,
      runtimeSeconds,
      selectedSpeciesId: capture.selectedSpeciesId,
      selectedSpeciesName: capture.selectedSpeciesName,
      selectedSpeciesPopBefore: capture.selectedSpeciesPopBefore,
      selectedSpeciesPopAfter,
      selectedSpeciesPopDelta,
    }

    this.lastDeepTimeSummary = summary
    this.emitDeepTimeSummary(summary)
    this.life.clearRecentActivity()
    return summary
  }

  runDeepTimeTicks(totalTicks: number, selectedSpeciesId: string | null = null): DeepTimeSummary {
    const capture = this.startDeepTimeCapture(selectedSpeciesId)

    let remaining = totalTicks
    while (remaining > 0) {
      const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
      this.stepDeepTimeBatch(chunk)
      remaining -= chunk
    }

    return this.finalizeDeepTime(capture)
  }

  runDeepTimeYears(years: number, selectedSpeciesId: string | null = null): DeepTimeSummary {
    return this.runDeepTimeTicks(yearsToTicks(years), selectedSpeciesId)
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

  getSnapshot(includeOrganisms = true): SimulationSnapshot {
    const life = this.life.getSnapshot(includeOrganisms)
    const briefing = buildBriefing(
      this.tick,
      life,
      this.events,
      this.lastDeepTimeSummary,
      this.speciesPopBeforeStep,
      null,
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

  getSnapshotWithSelectedSpecies(selectedSpeciesId: string | null): SimulationSnapshot {
    const life = this.life.getSnapshot(true)
    const briefing = buildBriefing(
      this.tick,
      life,
      this.events,
      this.lastDeepTimeSummary,
      this.speciesPopBeforeStep,
      selectedSpeciesId,
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
      `${summary.startYear} → ${summary.endYear} yr (${summary.elapsedSimYears} yr elapsed)`,
      `${summary.runtimeSeconds.toFixed(1)}s runtime`,
      `organisms ${summary.startOrganisms} → ${summary.endOrganisms} (${summary.organismDelta >= 0 ? '+' : ''}${summary.organismDelta})`,
      `species ${summary.startSpecies} → ${summary.endSpecies}`,
      `${summary.colonizedTilesDelta >= 0 ? '+' : ''}${summary.colonizedTilesDelta} colonized tiles`,
      `${summary.changedTilesCount} tiles changed`,
    ]
    if (summary.majorBlooms > 0) parts.push('major bloom')
    if (summary.majorDieOffs > 0) parts.push('major die-off')
    if (summary.newSpecies.length > 0) {
      parts.push(`new: ${summary.newSpecies.slice(0, 3).join(', ')}`)
    }
    if (summary.extinctions.length > 0) {
      parts.push(`extinct: ${summary.extinctions.slice(0, 3).join(', ')}`)
    }
    if (summary.dominantSpeciesBefore !== summary.dominantSpeciesAfter) {
      parts.push(`dominant: ${summary.dominantSpeciesBefore ?? 'none'} → ${summary.dominantSpeciesAfter ?? 'none'}`)
    }
    if (summary.selectedSpeciesName && summary.selectedSpeciesPopDelta !== null) {
      parts.push(
        `${summary.selectedSpeciesName}: ${summary.selectedSpeciesPopBefore} → ${summary.selectedSpeciesPopAfter} (${summary.selectedSpeciesPopDelta >= 0 ? '+' : ''}${summary.selectedSpeciesPopDelta})`,
      )
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

export { TICK_EVENT_INTERVAL, DEEP_TIME_CHUNK_SIZE, DEEP_TIME_UI_SYNC_MS }
