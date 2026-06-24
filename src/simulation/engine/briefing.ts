import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot, SpeciesRecord } from '../../types/life'
import type {
  BriefingSnapshot,
  DeepTimeSummary,
  EventLogEntry,
  SelectedSpeciesBriefing,
} from '../../types/runtime'
import { threatStatus } from '../species/speciesOccupancy'
import {
  eraForTick,
  tickToGenerations,
  tickToYears,
} from '../engine/simTime'
import { buildLatestDevelopments } from '../engine/developments'
import { buildSelectionNarratives } from '../species/speciesSelectionMetrics'
import type { World } from '../../types/simulation'

export function buildBriefing(
  tick: number,
  world: World,
  life: LifeSnapshot,
  agents: AgentSnapshot,
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
    'agent.spawned',
    'agent.migrated',
    'agent.grazed',
    'agent.predation',
    'agent.starved',
    'agent.reproduced',
    'agent.local_extinction',
    'foodweb.prey_collapse',
    'foodweb.predator_starvation',
    'foodweb.population_cycle',
  ])
  const latestMajor = events.find((e) => majorTypes.has(e.type))
  const foodWebEvent = events.find((e) =>
    e.type.startsWith('foodweb.') || e.type.startsWith('agent.predation') || e.type.startsWith('agent.migrated'),
  )

  const selectedSpecies = selectedSpeciesId
    ? buildSelectedSpeciesBriefing(selectedSpeciesId, life, agents, speciesPopHistory)
    : null

  const dominantGrazer = life.species.find((s) => s.id === agents.dominantGrazerSpeciesId)
  const dominantPredator = life.species.find((s) => s.id === agents.dominantPredatorSpeciesId)

  let predatorPreyTrend: string | null = null
  if (agents.grazerCount > 0 || agents.predatorCount > 0) {
    predatorPreyTrend = `${agents.grazerCount} grazers · ${agents.predatorCount} predators · ${agents.scavengerCount} scavengers`
  }

  let foodWebWarning: string | null = null
  if (agents.predatorCount >= 3 && agents.grazerCount < 4) {
    foodWebWarning = 'Prey collapse risk — predators may starve'
  } else if (agents.grazerCount >= 10 && agents.predatorCount === 0) {
    foodWebWarning = 'Ungulate bloom — no predation pressure'
  }

  return {
    simulatedYear: tickToYears(tick),
    estimatedGenerations: tickToGenerations(tick),
    era: eraForTick(tick, hasPlants, hasAlgae, agents.totalAgents > 0, agents.predatorCount),
    totalOrganisms: life.totalOrganisms + agents.totalAgents,
    totalBiomass: life.totalBiomass + agents.totalBiomass,
    speciesCount: aliveSpecies.length,
    dominantKind,
    dominantSpeciesName: dominant?.name ?? null,
    fastestGrowingSpecies: fastestGrowing?.name ?? null,
    mostThreatenedSpecies: mostThreatened?.name ?? null,
    latestMajorEvent: latestMajor?.message ?? null,
    latestDeepTimeSummary: lastDeepTimeSummary,
    selectedSpecies,
    dominantGrazerSpecies: dominantGrazer?.name ?? null,
    dominantPredatorSpecies: dominantPredator?.name ?? null,
    predatorPreyTrend,
    foodWebWarning,
    recentFoodWebEvent: foodWebEvent?.message ?? null,
    latestDevelopments: buildLatestDevelopments(
      tick,
      world,
      life,
      agents,
      events,
      selectedSpeciesId,
      speciesPopHistory,
    ),
    selectionNarratives: buildSelectionNarratives(agents.speciesSelectionProfiles, life.species),
  }
}

function buildSelectedSpeciesBriefing(
  speciesId: string,
  life: LifeSnapshot,
  agents: AgentSnapshot,
  speciesPopHistory: Map<string, number>,
): SelectedSpeciesBriefing | null {
  const record = life.species.find((s) => s.id === speciesId)
  if (!record || record.population <= 0) return null

  const occupancy = life.speciesOccupancy[speciesId]
  const prevPop = speciesPopHistory.get(speciesId) ?? record.population
  const profile = agents.speciesSelectionProfiles[speciesId]

  const predatorNames = record.predatorSpeciesIds
    .map((id) => life.species.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[]
  const preyNames = record.preySpeciesIds
    .map((id) => life.species.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[]

  return {
    speciesId,
    name: record.name,
    kind: record.kind,
    trophicRole: record.trophicRole,
    population: record.population,
    biomass: record.totalBiomass,
    occupiedTiles: occupancy?.occupiedTileCount ?? 0,
    avgGeneration: occupancy?.avgGeneration ?? record.generation,
    avgEnergy: occupancy?.avgEnergy ?? 0,
    avgHealth: occupancy?.avgHealth ?? 0,
    dominantTerrain: occupancy?.dominantTerrain?.replace(/_/g, ' ') ?? null,
    trend: threatStatus(record, prevPop),
    popDelta: record.population - prevPop,
    predatorLinks: predatorNames,
    preyLinks: preyNames,
    bodyPlanSummary: profile?.bodyPlanSummary ?? null,
    sensesSummary: profile?.sensesSummary ?? null,
    environmentalFitnessScore: profile?.environmentalFitnessScore ?? null,
    selectionPressures: profile?.selectionPressures ?? [],
    extinctionRisk: profile?.extinctionRisk ?? null,
    adaptationNotes: profile?.adaptationNotes ?? [],
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
