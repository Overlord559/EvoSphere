import { nanoid } from 'nanoid'
import type {
  EventLogEntry,
  SimulationSettings,
  SimulationSnapshot,
  World,
} from '../../types/simulation'
import { LifeSystem } from '../life/LifeSystem'
import { generateWorld } from '../world/generateWorld'

const TICK_EVENT_INTERVAL = 50

export class SimEngine {
  private tick = 0
  private world: World
  private settings: SimulationSettings
  private readonly events: EventLogEntry[] = []
  private readonly life: LifeSystem

  constructor(settings: SimulationSettings) {
    this.settings = { ...settings }
    this.world = generateWorld(this.settings)
    this.life = new LifeSystem(this.settings.seed, this.world)
    this.emitEvent(
      'world.generated',
      `World generated from seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
    this.life.seedInitialLife(this.world, (type, message) => this.emitEvent(type, message))
  }

  step(): void {
    this.tick += 1
    this.world = { ...this.world, tick: this.tick }
    this.life.tick(this.world, this.tick, (type, message) => this.emitEvent(type, message))

    if (this.tick % TICK_EVENT_INTERVAL === 0) {
      const lifeSnap = this.life.getSnapshot()
      this.emitEvent(
        'world.tick',
        `Tick ${this.tick} — ${lifeSnap.totalOrganisms} organisms, ${lifeSnap.totalBiomass.toFixed(1)} biomass, ${lifeSnap.species.length} species`,
      )
    }
  }

  reset(overrides?: Partial<SimulationSettings>): void {
    this.tick = 0
    this.events.length = 0
    this.settings = { ...this.settings, ...overrides }
    this.world = generateWorld(this.settings)
    this.life.reset(this.world, (type, message) => this.emitEvent(type, message))
    this.emitEvent(
      'world.reset',
      `World reset with seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
  }

  getSettings(): SimulationSettings {
    return { ...this.settings }
  }

  getWorld(): World {
    return this.world
  }

  getSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      worldId: this.world.id,
      world: this.world,
      events: [...this.events],
      life: this.life.getSnapshot(),
    }
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

export { TICK_EVENT_INTERVAL }
