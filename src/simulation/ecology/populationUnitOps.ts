import type { AgentKind } from '../../types/agents'
import type { LifeKind } from '../../types/life'
import type { PopulationUnit } from './populationUnits'
import { getRepresentationScale } from './representationScale'

function tileDistance(a: number, b: number, worldWidth: number): number {
  const ax = a % worldWidth
  const ay = Math.floor(a / worldWidth)
  const bx = b % worldWidth
  const by = Math.floor(b / worldWidth)
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

function geneticSimilarity(a: PopulationUnit, b: PopulationUnit): number {
  if (a.speciesId !== b.speciesId) return 0
  const genDiff = Math.abs(a.averageGeneration - b.averageGeneration)
  return Math.max(0, 1 - genDiff / 12)
}

/** Deterministic merge of two units — preserves total representedIndividuals and biomass. */
export function mergePopulationUnits(primary: PopulationUnit, secondary: PopulationUnit): PopulationUnit {
  const totalInd = primary.representedIndividuals + secondary.representedIndividuals
  const totalBio = primary.biomass + secondary.biomass
  const w1 = primary.representedIndividuals / Math.max(1, totalInd)
  const w2 = secondary.representedIndividuals / Math.max(1, totalInd)

  return {
    ...primary,
    representedIndividuals: totalInd,
    biomass: totalBio,
    density: Math.min(1, (primary.density + secondary.density) * 0.5),
    health: primary.health * w1 + secondary.health * w2,
    averageEnergy: primary.averageEnergy * w1 + secondary.averageEnergy * w2,
    averageAge: primary.averageAge * w1 + secondary.averageAge * w2,
    averageGeneration: primary.averageGeneration * w1 + secondary.averageGeneration * w2,
    lastUpdatedTick: Math.max(primary.lastUpdatedTick, secondary.lastUpdatedTick),
  }
}

/** Deterministic split — half representedIndividuals to new unit on adjacent tile. */
export function splitPopulationUnit(
  unit: PopulationUnit,
  destTileIndex: number,
  newId: string,
  tick: number,
): { source: PopulationUnit; split: PopulationUnit } | null {
  if (unit.representedIndividuals < getRepresentationScale(unit.kind).individualsPerUnit * 1.5) {
    return null
  }

  const halfInd = Math.floor(unit.representedIndividuals / 2)
  const halfBio = unit.biomass / 2

  const source: PopulationUnit = {
    ...unit,
    representedIndividuals: unit.representedIndividuals - halfInd,
    biomass: unit.biomass - halfBio,
    lastUpdatedTick: tick,
  }

  const split: PopulationUnit = {
    ...unit,
    id: newId,
    tileIndex: destTileIndex,
    representedIndividuals: halfInd,
    biomass: halfBio,
    lastUpdatedTick: tick,
  }

  return { source, split }
}

export interface MergeCandidate {
  keyA: string
  keyB: string
  score: number
}

/** Find merge pairs when unit budget exceeded — deterministic sort by score desc. */
export function findMergeCandidates(
  units: Map<string, PopulationUnit>,
  worldWidth: number,
  maxDistance = 2,
): MergeCandidate[] {
  const entries = [...units.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const candidates: MergeCandidate[] = []

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [keyA, unitA] = entries[i]
      const [keyB, unitB] = entries[j]
      if (unitA.speciesId !== unitB.speciesId) continue
      if (unitA.kind !== unitB.kind) continue

      const dist = tileDistance(unitA.tileIndex, unitB.tileIndex, worldWidth)
      if (dist > maxDistance) continue

      const genetic = geneticSimilarity(unitA, unitB)
      const densityScore = 1 - Math.abs(unitA.density - unitB.density)
      const score = genetic * 0.5 + densityScore * 0.3 + (1 / (1 + dist)) * 0.2
      candidates.push({ keyA, keyB, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score || a.keyA.localeCompare(b.keyA))
}

export function isMobileKind(kind: LifeKind | AgentKind): kind is AgentKind {
  return kind === 'SimpleGrazer' || kind === 'SimplePredator' || kind === 'Scavenger'
}

export function isProducerKind(kind: LifeKind | AgentKind): kind is LifeKind {
  return !isMobileKind(kind)
}
