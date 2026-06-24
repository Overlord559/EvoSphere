import type { SpeciesMemory } from '../../types/cognition'
import { createEmptySpeciesMemory } from './speciesMemory'

/** Registry-side species memory store — bounded per species. */
export class SpeciesMemoryStore {
  private readonly memories = new Map<string, SpeciesMemory>()
  private readonly maxSpecies = 256

  ensure(speciesId: string): SpeciesMemory {
    let mem = this.memories.get(speciesId)
    if (!mem) {
      if (this.memories.size >= this.maxSpecies) {
        const first = this.memories.keys().next().value
        if (first) this.memories.delete(first)
      }
      mem = createEmptySpeciesMemory()
      this.memories.set(speciesId, mem)
    }
    return mem
  }

  get(speciesId: string): SpeciesMemory | undefined {
    return this.memories.get(speciesId)
  }

  learningScore(speciesId: string): number {
    return this.memories.get(speciesId)?.learningScore ?? 0
  }

  clear(): void {
    this.memories.clear()
  }
}

export { createEmptySpeciesMemory }
