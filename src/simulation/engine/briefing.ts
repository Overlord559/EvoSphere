import type { LifeKind, LifeSnapshot, SpeciesRecord } from '../../types/life'
import type { BriefingSnapshot, DeepTimeSummary, EventLogEntry } from '../../types/runtime'
import {
  eraForTick,
  tickToGenerations,
  tickToYears,
} from '../engine/simTime'

export function buildBriefing(
  tick: number,
  life: LifeSnapshot,
  events: EventLogEntry[],
  lastDeepTimeSummary: DeepTimeSummary | null,
  speciesPopHistory: Map<string, number>,
): BriefingSnapshot {
  const aliveSpecies = life.species.filter((s) => s.population > 0)
  const dominant = aliveSpecies[0] ?? null

  const hasPlants = aliveSpecies.some((s) => s.kind === 'PrimitivePlant')
  const hasAlgae = aliveSpecies.some((s) => s.kind === 'Algae')

  const dominantKind = dominant?.kind ?? null
  const fastestGrowing = findFastestGrowing(aliveSpecies, speciesPopHistory)
  const mostThreatened = findMostThreatened(aliveSpecies, speciesPopHistory)

  const majorTypes = new Set([
    'life.first',
    'life.bloom',
    'life.die_off',
    'life.extinction',
    'life.speciation',
    'life.colonization',
    'life.population_shift',
    'world.deep_time_summary',
  ])
  const latestMajor = events.find((e) => majorTypes.has(e.type))

  return {
    simulatedYear: tickToYears(tick),
    estimatedGenerations: tickToGenerations(tick),
    era: eraForTick(tick, hasPlants, hasAlgae),
    totalOrganisms: life.totalOrganisms,
    totalBiomass: life.totalBiomass,
    speciesCount: aliveSpecies.length,
    dominantKind,
    dominantSpeciesName: dominant?.name ?? null,
    fastestGrowingSpecies: fastestGrowing?.name ?? null,
    mostThreatenedSpecies: mostThreatened?.name ?? null,
    latestMajorEvent: latestMajor?.message ?? null,
    latestDeepTimeSummary: lastDeepTimeSummary,
  }
}

function findFastestGrowing(
  alive: SpeciesRecord[],
  history: Map<string, number>,
): SpeciesRecord | null {
  let best: SpeciesRecord | null = null
  let bestDelta = 0

  for (const species of alive) {
    const prev = history.get(species.id) ?? species.population
    const delta = species.population - prev
    if (delta > bestDelta && species.population >= 3) {
      bestDelta = delta
      best = species
    }
  }
  return best
}

function findMostThreatened(
  alive: SpeciesRecord[],
  history: Map<string, number>,
): SpeciesRecord | null {
  let worst: SpeciesRecord | null = null
  let worstScore = Infinity

  for (const species of alive) {
    if (species.population <= 0) continue
    const prev = history.get(species.id) ?? species.population
    const delta = species.population - prev
    const score = species.population + delta * 2
    if (score < worstScore && species.population < 20) {
      worstScore = score
      worst = species
    }
  }
  return worst
}

export function dominantKindFromLife(life: LifeSnapshot): LifeKind | null {
  const kindCounts = new Map<LifeKind, number>()
  for (const species of life.species) {
    if (species.population <= 0) continue
    kindCounts.set(species.kind, (kindCounts.get(species.kind) ?? 0) + species.population)
  }
  let best: LifeKind | null = null
  let bestCount = 0
  for (const [kind, count] of kindCounts) {
    if (count > bestCount) {
      bestCount = count
      best = kind
    }
  }
  return best
}
