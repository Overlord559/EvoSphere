import type { SpeciesMemory } from '../../types/cognition'
import type { TerrainType } from '../../types/simulation'
import { effectiveHabitatTerrain } from '../world/terrainHelpers'
import type { Tile } from '../../types/simulation'

export function createEmptySpeciesMemory(): SpeciesMemory {
  return {
    goodHabitatScores: {},
    dangerHabitatScores: {},
    foodPreference: 0.5,
    predatorAvoidance: 0.4,
    migrationTendency: 0.3,
    refugiaKnowledge: 0,
    learningScore: 0,
    dominantBehavior: 'explore',
  }
}

export function recordSpeciesHabitatSuccess(
  memory: SpeciesMemory,
  tile: Tile,
  fitness: number,
): void {
  const habitat = effectiveHabitatTerrain(tile)
  const prev = memory.goodHabitatScores[habitat] ?? 0
  memory.goodHabitatScores[habitat] = prev * 0.92 + fitness * 0.08
  memory.learningScore = Math.min(1, memory.learningScore + 0.002)
}

export function recordSpeciesHabitatDanger(
  memory: SpeciesMemory,
  habitat: TerrainType,
  severity: number,
): void {
  const prev = memory.dangerHabitatScores[habitat] ?? 0
  memory.dangerHabitatScores[habitat] = Math.min(1, prev * 0.9 + severity * 0.1)
}

export function recordSpeciesRefugiaSurvival(memory: SpeciesMemory): void {
  memory.refugiaKnowledge = Math.min(1, memory.refugiaKnowledge + 0.08)
  memory.learningScore = Math.min(1, memory.learningScore + 0.05)
}

export function speciesMemoryHabitatModifier(memory: SpeciesMemory, tile: Tile): number {
  const habitat = effectiveHabitatTerrain(tile)
  const good = memory.goodHabitatScores[habitat] ?? 0
  const danger = memory.dangerHabitatScores[habitat] ?? 0
  return 1 + good * 0.15 - danger * 0.2 + memory.refugiaKnowledge * 0.05
}

export function updateDominantBehavior(
  memory: SpeciesMemory,
  behavior: string,
): void {
  memory.dominantBehavior = behavior
}
