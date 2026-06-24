import { nanoid } from 'nanoid'
import type {
  EventLogEntry,
  SimulationSettings,
  SimulationSnapshot,
  World,
} from '../../types/simulation'
import { generateWorld } from '../world/generateWorld'

const TICK_EVENT_INTERVAL = 50

export class SimEngine {
  private tick = 0
  private world: World
  private settings: SimulationSettings
  private readonly events: EventLogEntry[] = []

  constructor(settings: SimulationSettings) {
    this.settings = { ...settings }
    this.world = generateWorld(this.settings)
    this.emitEvent(
      'world.generated',
      `World generated from seed "${this.settings.seed}" (${this.settings.worldWidth}×${this.settings.worldHeight})`,
    )
  }

  step(): void {
    this.tick += 1
    this.world = { ...this.world, tick: this.tick }

    if (this.tick % TICK_EVENT_INTERVAL === 0) {
      this.emitEvent(
        'world.tick',
        `World tick ${this.tick} — planetary state advancing (no life systems yet)`,
      )
    }
  }

  reset(overrides?: Partial<SimulationSettings>): void {
    this.tick = 0
    this.events.length = 0
    this.settings = { ...this.settings, ...overrides }
    this.world = generateWorld(this.settings)
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
