import { nanoid } from 'nanoid'
import type {
  EventLogEntry,
  SimulationSettings,
  SimulationSnapshot,
  World,
} from '../../types/simulation'
import type { DeepTimeSummary, SimSpeed } from '../../types/runtime'
import { AgentSystem } from '../agents/AgentSystem'
import { DisasterSystem } from '../disasters/DisasterSystem'
import { DEFAULT_DISASTER_SETTINGS } from '../config/disasterConfig'
import { computeSuccessionSnapshot, tickSuccession } from '../ecology/succession'
import {
  createBottleneckState,
  recoveryModifiers,
  updateBottleneckDetection,
  type BottleneckMetrics,
  type BottleneckState,
} from '../evolution/bottleneckRecovery'
import type { DisasterType } from '../disasters/DisasterTypes'
import { LifeSystem } from '../life/LifeSystem'
import { generateWorld } from '../world/generateWorld'
import { buildBriefing } from './briefing'
import {
  MAX_EVENTS_RETAINED,
  RUNAWAY_AGENT_POPULATION,
  RUNAWAY_ORGANISM_POPULATION,
  STABILITY_GUARD_INTERVAL,
} from './stabilityGuards'
import { globalProfiler } from './performanceProfiler'
import { SPEED_SCHEDULE } from './simScheduler'
import { tickToYears, yearsToTicks } from './simTime'

const TICK_EVENT_INTERVAL = 500
const DEEP_TIME_CHUNK_SIZE = 5000
const DEEP_TIME_UI_SYNC_MS = 120

const NOOP_EMIT = (): void => {}

export interface SnapshotOptions {
  includeOrganisms?: boolean
  includeAgents?: boolean
  fullBriefing?: boolean
}

export interface DeepTimeCapture {
  startSnap: ReturnType<LifeSystem['getSnapshot']>
  startAgents: ReturnType<AgentSystem['getSnapshot']>
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
  startGrazers: number
  startPredators: number
}

export class SimEngine {
  private tick = 0
  private world: World
  private settings: SimulationSettings
  private readonly events: EventLogEntry[] = []
  private readonly life: LifeSystem
  private readonly agents: AgentSystem
  private readonly disasters: DisasterSystem
  private lastDeepTimeSummary: DeepTimeSummary | null = null
  private speciesPopBeforeStep = new Map<string, number>()
  private deepTimeMode = false
  private renderSnapshotVersion = 0
  private lastSnapshotTick = 0
  private eventThrottleCounter = 0
  private stabilityWarning: string | null = null
  private cachedBriefing: SimulationSnapshot['briefing'] | null = null
  private cachedBriefingTick = -1
  private successionLastEventTick = 0
  private bottleneckState: BottleneckState = createBottleneckState()
  private prevBottleneckMetrics: BottleneckMetrics = {
    totalPopulation: 0,
    speciesCount: 0,
    colonizedTiles: 0,
    producerBiomass: 0,
    dominantShare: 0,
  }
  private herbivoryPressure: number[] = []

  constructor(settings: SimulationSettings) {
    this.settings = { ...settings }
    this.world = generateWorld(this.settings)
    this.life = new LifeSystem(this.settings.seed, this.world)
    this.agents = new AgentSystem(this.settings.seed, this.world, this.life)
    this.disasters = new DisasterSystem(this.settings.seed, DEFAULT_DISASTER_SETTINGS)
    this.herbivoryPressure = new Array(this.world.width * this.world.height).fill(0)
    this.emitEvent(
      'world.generated',
      `World generated from seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight}, planet r=${this.world.planetRadius.toFixed(1)}) — origin: ${this.world.originProfile.originProfileName}`,
    )
    this.life.seedInitialLife(this.world, (type, message) => this.emitEvent(type, message))
    this.agents.seedInitialAgents(this.world, (type, message) => this.emitEvent(type, message))
    this.captureSpeciesPopBefore()
    this.lastSnapshotTick = this.tick
  }

  step(count = 1, suppressMinorEvents = false, speed: SimSpeed = 'normal'): number {
    const schedule = speed !== 'deep' ? SPEED_SCHEDULE[speed] : null
    let stepsRun = 0
    const simStart = performance.now()

    for (let i = 0; i < count; i++) {
      this.tick += 1
      this.world.tick = this.tick
      globalProfiler.time('lifeTick', () => {
        this.life.tick(this.world, this.tick, (type, message) => this.emitEvent(type, message, schedule?.eventThrottleFactor), suppressMinorEvents)
      })
      globalProfiler.time('agentTick', () => {
        this.agents.tick(this.world, this.tick, (type, message) => this.emitEvent(type, message, schedule?.eventThrottleFactor), suppressMinorEvents)
      })
      globalProfiler.time('disasterTick', () => {
        this.disasters.tick(this.world, this.tick, this.life, this.agents, (type, message) => this.emitEvent(type, message, schedule?.eventThrottleFactor), suppressMinorEvents)
      })

      if (this.tick % 3 === 0) {
        globalProfiler.time('successionTick', () => {
          const lifeSnap = this.life.getTileBiomassArray()
          const counts = this.life.getTileCountsArray()
          const result = tickSuccession(
            this.world,
            {
              tileBiomass: lifeSnap,
              tileCounts: counts,
              worldWidth: this.world.width,
              tick: this.tick,
              lastEventTick: this.successionLastEventTick,
              herbivoryPressure: this.herbivoryPressure,
            },
            (type, message) => this.emitEvent(type, message, schedule?.eventThrottleFactor),
            suppressMinorEvents,
          )
          this.successionLastEventTick = result.lastEventTick
        })
      }

      if (this.tick % 10 === 0) {
        this.life.getRegistry().tickEstablishment(this.tick)
        this.runBottleneckDetection(suppressMinorEvents)
      }

      if (!this.deepTimeMode && this.tick % TICK_EVENT_INTERVAL === 0) {
        const lifeSnap = this.life.getSnapshot(false)
        const agentSnap = this.agents.getSnapshot(false)
        const aliveSpecies = lifeSnap.species.filter((s) => s.population > 0).length
        this.emitEvent(
          'world.tick',
          `Tick ${this.tick} (~${tickToYears(this.tick)} yr) — ${lifeSnap.totalOrganisms} organisms, ${agentSnap.totalAgents} mobile agents, ${lifeSnap.totalBiomass.toFixed(1)} biomass, ${aliveSpecies} species`,
          schedule?.eventThrottleFactor,
        )
      }
      stepsRun += 1
    }

    if (this.tick % STABILITY_GUARD_INTERVAL === 0) {
      globalProfiler.time('stabilityGuards', () => {
        this.runStabilityGuards()
      })
    }
    this.captureSpeciesPopBefore()
    globalProfiler.recordFrame(count, false, false)
    return performance.now() - simStart
  }

  stepDeepTimeBatch(tickCount: number): void {
    this.deepTimeMode = true
    this.agents.resetDeepStats()
    let t = this.tick
    for (let i = 0; i < tickCount; i++) {
      t += 1
      this.world.tick = t
      this.life.tick(this.world, t, NOOP_EMIT, true)
      this.agents.tick(this.world, t, NOOP_EMIT, true)
    }
    this.tick = t
    this.deepTimeMode = false
    this.runStabilityGuards()
    this.captureSpeciesPopBefore()
  }

  getInternalTick(): number {
    return this.tick
  }

  getLastSnapshotTick(): number {
    return this.lastSnapshotTick
  }

  getRenderSnapshotVersion(): number {
    return this.renderSnapshotVersion
  }

  getStabilityWarning(): string | null {
    return this.stabilityWarning
  }

  startDeepTimeCapture(selectedSpeciesId: string | null = null): DeepTimeCapture {
    const startSnap = this.life.getSnapshot(false, this.world, this.agents.getSnapshot(false).agents)
    const startAgents = this.agents.getSnapshot(false)
    const selectedRecord = selectedSpeciesId
      ? startSnap.species.find((s) => s.id === selectedSpeciesId)
      : undefined

    return {
      startSnap,
      startAgents,
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
      startGrazers: startAgents.grazerCount,
      startPredators: startAgents.predatorCount,
    }
  }

  finalizeDeepTime(capture: DeepTimeCapture): DeepTimeSummary {
    const endSnap = this.life.getSnapshot(false, this.world, this.agents.getSnapshot(false).agents)
    const endAgents = this.agents.getSnapshot(false)
    const endColonized = this.life.getColonizedTileCount()
    const endDominant = endSnap.species.find((s) => s.population > 0)?.name ?? null
    const changedTiles = this.life.countChangedTiles(capture.startTileCounts)
    const runtimeSeconds = (performance.now() - capture.runtimeStartMs) / 1000
    const deepStats = this.agents.getDeepStats()

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

    const startDominantGrazer = capture.startAgents.dominantGrazerSpeciesId
    const endDominantGrazer = endAgents.dominantGrazerSpeciesId
    const startDominantPred = capture.startAgents.dominantPredatorSpeciesId
    const endDominantPred = endAgents.dominantPredatorSpeciesId
    let dominantTrophicShift: string | null = null
    if (startDominantGrazer !== endDominantGrazer || startDominantPred !== endDominantPred) {
      dominantTrophicShift = `grazer/predator dominance shifted`
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
      startGrazers: capture.startGrazers,
      endGrazers: endAgents.grazerCount,
      grazerDelta: endAgents.grazerCount - capture.startGrazers,
      startPredators: capture.startPredators,
      endPredators: endAgents.predatorCount,
      predatorDelta: endAgents.predatorCount - capture.startPredators,
      predationCount: deepStats.predationCount,
      starvationCount: deepStats.starvationCount,
      localExtinctions: deepStats.localExtinctions,
      dominantTrophicShift,
    }

    this.lastDeepTimeSummary = summary
    this.emitDeepTimeSummary(summary)
    this.life.clearRecentActivity()
    this.agents.clearRecentActivity()
    this.cachedBriefing = null
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
    this.stabilityWarning = null
    this.cachedBriefing = null
    this.cachedBriefingTick = -1
    this.settings = { ...this.settings, ...overrides }
    this.world = generateWorld(this.settings)
    this.life.reset(this.world, (type, message) => this.emitEvent(type, message))
    this.agents.reset(this.world, (type, message) => this.emitEvent(type, message))
    this.disasters.reset()
    this.bottleneckState = createBottleneckState()
    this.successionLastEventTick = 0
    this.emitEvent(
      'world.reset',
      `World reset with seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
    this.captureSpeciesPopBefore()
    this.lastSnapshotTick = this.tick
    this.renderSnapshotVersion += 1
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

  getDisasterSystem(): DisasterSystem {
    return this.disasters
  }

  getSuccessionSnapshot() {
    return computeSuccessionSnapshot(this.world)
  }

  getBottleneckState(): BottleneckState {
    return { ...this.bottleneckState }
  }

  private runBottleneckDetection(suppressMinorEvents: boolean): void {
    const lifeSnap = this.life.getSnapshot(false, this.world)
    const agentSnap = this.agents.getSnapshot(false)
    const alive = lifeSnap.species.filter((s) => s.population > 0 && s.establishmentStatus !== 'failed')
    const dominant = alive[0]
    const totalPop = lifeSnap.totalOrganisms + agentSnap.totalAgents
    const dominantShare =
      dominant && totalPop > 0 ? (dominant.population + (agentSnap.totalAgents > 0 ? 1 : 0)) / totalPop : 0

    const current: BottleneckMetrics = {
      totalPopulation: totalPop,
      speciesCount: alive.length,
      colonizedTiles: this.life.getColonizedTileCount(),
      producerBiomass: lifeSnap.totalBiomass,
      dominantShare,
    }

    this.bottleneckState = updateBottleneckDetection(
      this.bottleneckState,
      this.tick,
      current,
      this.prevBottleneckMetrics,
      (type, message) => this.emitEvent(type, message),
      suppressMinorEvents,
    )

    const mods = recoveryModifiers(this.bottleneckState)
    this.life.setRecoveryModifiers(mods)
    this.agents.setRecoveryModifiers(mods)

    if (this.bottleneckState.recoveryActive && !suppressMinorEvents && this.tick % 400 === 0) {
      this.emitEvent('evolution.adaptive_radiation', 'Adaptive radiation pressure — survivors diversifying into open niches.')
    }

    this.prevBottleneckMetrics = current
  }

  injectDisaster(type: DisasterType, severityValue = 0.55): boolean {
    return this.disasters.injectDisaster(this.world, this.tick, type, severityValue, (t, m) =>
      this.emitEvent(t, m),
    ) !== null
  }

  injectRandomDisaster(): boolean {
    return this.disasters.injectRandomDisaster(this.world, this.tick, (t, m) =>
      this.emitEvent(t, m),
    ) !== null
  }

  getRecentActivityTileIndices(): number[] {
    return [...new Set([...this.life.getRecentActivityTiles(), ...this.agents.getRecentActivityTiles()])]
  }

  private buildSnapshot(
    includeOrganisms: boolean,
    includeAgents: boolean,
    fullBriefing: boolean,
    selectedSpeciesId: string | null,
  ): SimulationSnapshot {
    const agentSnap = globalProfiler.time('speciesMetrics', () =>
      this.agents.getSnapshot(includeAgents),
    )
    const life = globalProfiler.time('snapshotBuild', () =>
      this.life.getSnapshot(includeOrganisms, this.world, agentSnap.agents),
    )

    let briefing = this.cachedBriefing
    if (fullBriefing || !briefing || this.cachedBriefingTick !== this.tick) {
      briefing = globalProfiler.time('briefingBuild', () => buildBriefing(
        this.tick,
        this.world,
        life,
        agentSnap,
        this.events,
        this.lastDeepTimeSummary,
        this.speciesPopBeforeStep,
        selectedSpeciesId,
        this.disasters.getSnapshot(),
      ))
      if (fullBriefing) {
        this.cachedBriefing = briefing
        this.cachedBriefingTick = this.tick
      }
    }

    this.renderSnapshotVersion += 1
    this.lastSnapshotTick = this.tick
    globalProfiler.recordFrame(0, true, false)
    globalProfiler.setEventsRetained(this.events.length)

    return {
      tick: this.tick,
      worldId: this.world.id,
      world: this.world,
      events: [...this.events],
      life,
      agents: agentSnap,
      briefing,
      lastDeepTimeSummary: this.lastDeepTimeSummary,
      renderSnapshotVersion: this.renderSnapshotVersion,
      lastSnapshotTick: this.lastSnapshotTick,
      disasters: this.disasters.getSnapshot(),
    }
  }

  getSnapshot(includeOrganisms = true): SimulationSnapshot {
    return this.buildSnapshot(includeOrganisms, true, true, null)
  }

  getSnapshotWithSelectedSpecies(
    selectedSpeciesId: string | null,
    options: SnapshotOptions = {},
  ): SimulationSnapshot {
    return this.buildSnapshot(
      options.includeOrganisms ?? true,
      options.includeAgents ?? true,
      options.fullBriefing ?? true,
      selectedSpeciesId,
    )
  }

  private captureSpeciesPopBefore(): void {
    const map = new Map<string, number>()
    for (const species of this.life.getRegistry().getAll()) {
      map.set(species.id, species.population)
    }
    this.speciesPopBeforeStep = map
  }

  private runStabilityGuards(): void {
    const lifeRemoved = this.life.quarantineInvalid(this.world)
    const agentRemoved = this.agents.quarantineInvalid(this.world)
    const lifeCount = this.life.getOrganismCount()
    const agentCount = this.agents.getAgentCount()

    const warnings: string[] = []
    if (lifeRemoved > 0) warnings.push(`${lifeRemoved} invalid organisms removed`)
    if (agentRemoved > 0) warnings.push(`${agentRemoved} invalid agents removed`)
    if (lifeCount > RUNAWAY_ORGANISM_POPULATION) {
      warnings.push(`organism population high (${lifeCount}) — sim throttled`)
    }
    if (agentCount > RUNAWAY_AGENT_POPULATION) {
      warnings.push(`agent population high (${agentCount}) — sim throttled`)
    }

    this.stabilityWarning = warnings.length > 0 ? warnings.join(' · ') : null
  }

  private emitDeepTimeSummary(summary: DeepTimeSummary): void {
    const parts = [
      `${summary.startYear} → ${summary.endYear} yr (${summary.elapsedSimYears} yr elapsed)`,
      `${summary.runtimeSeconds.toFixed(1)}s runtime`,
      `organisms ${summary.startOrganisms} → ${summary.endOrganisms} (${summary.organismDelta >= 0 ? '+' : ''}${summary.organismDelta})`,
      `grazers ${summary.startGrazers} → ${summary.endGrazers}`,
      `predators ${summary.startPredators} → ${summary.endPredators}`,
      `species ${summary.startSpecies} → ${summary.endSpecies}`,
      `${summary.colonizedTilesDelta >= 0 ? '+' : ''}${summary.colonizedTilesDelta} colonized tiles`,
      `${summary.changedTilesCount} tiles changed`,
    ]
    if (summary.predationCount > 0) parts.push(`${summary.predationCount} predations`)
    if (summary.starvationCount > 0) parts.push(`${summary.starvationCount} starvations`)
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
    if (summary.dominantTrophicShift) parts.push(summary.dominantTrophicShift)
    if (summary.selectedSpeciesName && summary.selectedSpeciesPopDelta !== null) {
      parts.push(
        `${summary.selectedSpeciesName}: ${summary.selectedSpeciesPopBefore} → ${summary.selectedSpeciesPopAfter} (${summary.selectedSpeciesPopDelta >= 0 ? '+' : ''}${summary.selectedSpeciesPopDelta})`,
      )
    }

    this.emitEvent('world.deep_time_summary', `Deep time — ${parts.join(' · ')}`)
  }

  private emitEvent(type: string, message: string, throttleFactor = 1): void {
    if (throttleFactor > 1) {
      this.eventThrottleCounter += 1
      if (this.eventThrottleCounter % throttleFactor !== 0 && !type.startsWith('world.')) return
    }

    this.events.unshift({
      id: nanoid(),
      tick: this.tick,
      type,
      message,
      timestamp: Date.now(),
    })
    if (this.events.length > MAX_EVENTS_RETAINED) {
      this.events.length = MAX_EVENTS_RETAINED
    }
  }
}

export { TICK_EVENT_INTERVAL, DEEP_TIME_CHUNK_SIZE, DEEP_TIME_UI_SYNC_MS }
