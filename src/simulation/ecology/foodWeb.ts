import type { FoodWebLink } from '../../types/agents'

export class FoodWebTracker {
  private readonly links = new Map<string, FoodWebLink>()
  private readonly preyByPredator = new Map<string, Set<string>>()
  private readonly predatorsByPrey = new Map<string, Set<string>>()

  private linkKey(predatorId: string, preyId: string): string {
    return `${predatorId}:${preyId}`
  }

  recordPredation(predatorSpeciesId: string, preySpeciesId: string): void {
    const key = this.linkKey(predatorSpeciesId, preySpeciesId)
    const existing = this.links.get(key)
    if (existing) {
      existing.predationCount += 1
    } else {
      this.links.set(key, { predatorSpeciesId, preySpeciesId, predationCount: 1 })
    }

    if (!this.preyByPredator.has(predatorSpeciesId)) {
      this.preyByPredator.set(predatorSpeciesId, new Set())
    }
    this.preyByPredator.get(predatorSpeciesId)!.add(preySpeciesId)

    if (!this.predatorsByPrey.has(preySpeciesId)) {
      this.predatorsByPrey.set(preySpeciesId, new Set())
    }
    this.predatorsByPrey.get(preySpeciesId)!.add(predatorSpeciesId)
  }

  getLinks(): FoodWebLink[] {
    return [...this.links.values()].sort((a, b) => b.predationCount - a.predationCount)
  }

  getPreyIds(speciesId: string): string[] {
    return [...(this.preyByPredator.get(speciesId) ?? [])]
  }

  getPredatorIds(speciesId: string): string[] {
    return [...(this.predatorsByPrey.get(speciesId) ?? [])]
  }

  clear(): void {
    this.links.clear()
    this.preyByPredator.clear()
    this.predatorsByPrey.clear()
  }
}

export function syncSpeciesFoodWeb(
  species: { id: string; preySpeciesIds: string[]; predatorSpeciesIds: string[] }[],
  tracker: FoodWebTracker,
): void {
  for (const record of species) {
    record.preySpeciesIds = tracker.getPreyIds(record.id)
    record.predatorSpeciesIds = tracker.getPredatorIds(record.id)
  }
}
