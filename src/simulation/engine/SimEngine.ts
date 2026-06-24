import type { SimulationSettings, SimulationSnapshot } from '../../types/simulation'
import { createRng, type Rng } from '../../utils/rng'

export class SimEngine {
  private tick = 0
  private readonly rng: Rng
  private readonly worldId: string
  private readonly settings: SimulationSettings

  constructor(settings: SimulationSettings) {
    this.settings = settings
    this.rng = createRng(settings.seed)
    this.worldId = settings.seed
  }

  step(): void {
    this.tick += 1
    void this.rng
    void this.settings
  }

  getSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      worldId: this.worldId,
      populationCount: 0,
      eventCount: 0,
    }
  }
}
