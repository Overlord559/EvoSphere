import type { LifeSnapshot, SpeciesRecord } from '../../types/life'
import type { BriefingSnapshot, DeepTimeSummary, EventLogEntry, SelectedSpeciesBriefing } from '../../types/runtime'
import { threatStatus } from '../species/speciesOccupancy'
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
  selectedSpeciesId: string | null,
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

  const selectedSpecies = selectedSpeciesId
    ? buildSelectedSpeciesBriefing(selectedSpeciesId, life, speciesPopHistory)
    : null

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
    selectedSpecies,
  }
}

function buildSelectedSpeciesBriefing(
  speciesId: string,
  life: LifeSnapshot,
  speciesPopHistory: Map<string, number>,
): SelectedSpeciesBriefing | null {
  const record = life.species.find((s) => s.id === speciesId)
  if (!record || record.population <= 0) return null

  const occupancy = life.speciesOccupancy[speciesId]
  const prevPop = speciesPopHistory.get(speciesId) ?? record.population

  return {
    speciesId,
    name: record.name,
    kind: record.kind,
    population: record.population,
    biomass: record.totalBiomass,
    occupiedTiles: occupancy?.occupiedTileCount ?? 0,
    avgGeneration: occupancy?.avgGeneration ?? record.generation,
    avgEnergy: occupancy?.avgEnergy ?? 0,
    avgHealth: occupancy?.avgHealth ?? 0,
    dominantTerrain: occupancy?.dominantTerrain?.replace(/_/g, ' ') ?? null,
    trend: threatStatus(record, prevPop),
    popDelta: record.population - prevPop,
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

export { buildSelectedSpeciesBriefing }
