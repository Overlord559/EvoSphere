import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot, SpeciesRecord } from '../../types/life'
import type {
  BriefingSnapshot,
  DeepTimeSummary,
  DisasterSnapshot,
  EventLogEntry,
  SelectedSpeciesBriefing,
} from '../../types/runtime'
import { formatEstimatedPopulation } from '../ecology/representationScale'
import { formatForensicsSummary } from '../ecology/extinctionForensics'
import { originScenarioLabel, type OriginScenarioId } from '../world/originScenarios'
import { threatStatus } from '../species/speciesOccupancy'
import {
  eraForTick,
  tickToGenerations,
  tickToYears,
} from '../engine/simTime'
import { buildLatestDevelopments } from '../engine/developments'
import { buildSelectionNarratives } from '../species/speciesSelectionMetrics'
import { computeSuccessionSnapshot } from '../ecology/succession'
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
  disasters: DisasterSnapshot,
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

  const succession = computeSuccessionSnapshot(world)
  const settings = disasters.settings
  let disasterPacingSummary: string | null = null
  if (settings) {
    const parts = [
      `Frequency: ${settings.naturalDisasterFrequency}`,
      `Mass extinctions: ${settings.massExtinctionFrequency}`,
    ]
    if (settings.disasterSafeMode) parts.push('Safe mode ON (refugia preserved)')
    if (disasters.lastMajorDisasterYear != null && disasters.lastMajorDisasterYear > 0) {
      parts.push(`Last major disaster ~yr ${disasters.lastMajorDisasterYear}`)
    }
    disasterPacingSummary = parts.join(' · ')
  }

  const mobileWithController = agents.agents.filter((a) => a.controller != null).length
  const protoCognitionSummary =
    mobileWithController > 0
      ? `${mobileWithController} mobile agents with adaptive controllers · species memory active`
      : null

  const popArch = life.populationArchitecture
  let plateauExplanation: string | null = null
  if (popArch.artificialCapEngaged && popArch.representationCapped) {
    const rep = popArch.representation
    plateauExplanation = `Population compressed into ${rep.populationUnitsCount} cohort/patch units (est. ${formatEstimatedPopulation(rep.estimatedBiologicalPopulation)} individuals); tracked individuals capped for performance.`
  } else if (popArch.capacityPressurePct >= 85) {
    plateauExplanation = 'Population plateau is ecological, not artificial — local carrying capacity reached.'
  }

  const bottleneckEvent = events.find((e) => e.type === 'evolution.bottleneck_detected')
  const recoveryEvent = events.find((e) => e.type === 'evolution.recovery_started')
  let bottleneckStatus: string | null = null
  if (recoveryEvent) {
    bottleneckStatus =
      popArch.bottleneckKind === 'artificial_cap_bottleneck'
        ? 'Representation cap active — aggregate pools absorbing growth'
        : popArch.bottleneckKind === 'expansion_failure'
          ? 'Expansion failure — boosting dispersal pressure'
          : popArch.bottleneckKind === 'carrying_capacity_plateau'
            ? 'Ecological carrying capacity plateau — speciation/competition active'
            : 'Recovery active — expansion pressure from refugia'
  } else if (bottleneckEvent) {
    bottleneckStatus = plateauExplanation ?? 'Bottleneck detected — monitoring population spread'
  }

  const rep = popArch.representation
  const totalBio =
    life.totalBiologicalPopulation + agents.totalMobilePopulation
  let representationSummary: string | null = null
  if (rep.populationUnitsCount > 0) {
    representationSummary = `Ecology uses ${rep.populationUnitsCount} simulation units (${rep.producerUnits} producer patches/blooms, ${rep.mobileCohorts} mobile cohorts) representing ~${formatEstimatedPopulation(totalBio)} individuals (${rep.compressionRatio}× compression).`
  }

  const renderBudgetSummary = `Only ~${160} moving representatives rendered for performance (estimated pop ~${formatEstimatedPopulation(totalBio)}). Scavenger/herd cohorts continue in aggregate; visible glyphs are sampled.`

  const declining = life.species.filter((s) => s.populationTrend === 'declining' && s.population > 0)
  const compressed = life.species.filter((s) => s.hiddenAsAggregate && s.population > 0)
  let extinctionForensicsSummary: string | null = null
  if (compressed.length > 0) {
    extinctionForensicsSummary = `${compressed.length} species hidden as aggregate cohorts — not extinct. ${compressed[0]?.populationChangeReason ?? ''}`
  } else if (declining.length > 0) {
    extinctionForensicsSummary =
      formatForensicsSummary(declining[0]) ?? declining[0].lastCauseOfDecline ?? null
  }

  const planetExtinction = events.find((e) => e.type === 'planet.extinction')
  const originScenarioLabelText = world.originProfile?.originScenarioId
    ? originScenarioLabel(world.originProfile.originScenarioId as OriginScenarioId)
    : world.originProfile?.originScenarioLabel ?? null

  const populationArchitecture: import('../../types/runtime').PopulationArchitectureBriefing = {
    trackedOrganisms: life.totalOrganisms,
    aggregateOrganisms: life.aggregateOrganisms,
    trackedAgents: agents.totalAgents,
    agentReserve: agents.populationReserve,
    worldCarryingCapacity: popArch.worldCarryingCapacityEstimate,
    capacityPressurePct: popArch.capacityPressurePct,
    expansionPressurePct: popArch.expansionPressurePct,
    artificialCapEngaged: popArch.artificialCapEngaged,
    representationCapped: popArch.representationCapped,
    bottleneckKind: popArch.bottleneckKind,
    plateauExplanation,
    populationUnitsCount: rep.populationUnitsCount,
    estimatedBiologicalPopulation: totalBio,
    compressionRatio: rep.compressionRatio,
    representationSummary,
  }

  return {
    simulatedYear: tickToYears(tick),
    estimatedGenerations: tickToGenerations(tick),
    era: eraForTick(tick, hasPlants, hasAlgae, agents.totalAgents > 0, agents.predatorCount),
    totalOrganisms: life.totalBiologicalPopulation + agents.totalMobilePopulation,
    totalBiomass: life.totalBiomass + life.aggregateBiomass + agents.totalBiomass,
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
      disasters,
    ),
    selectionNarratives: buildSelectionNarratives(agents.speciesSelectionProfiles, life.species),
    activeDisasters: disasters.active,
    originExplanation: world.originProfile?.explanation ?? null,
    successionOverview: {
      barrenPercent: succession.barrenPercent,
      microbialPercent: succession.microbialPercent,
      algalPercent: succession.algalPercent,
      pioneerPercent: succession.pioneerPercent,
      grasslandPercent: succession.grasslandPercent,
      forestPercent: succession.forestPercent,
      swampMarshPercent: succession.swampMarshPercent,
    },
    bottleneckStatus,
    protoCognitionSummary,
    disasterPacingSummary,
    populationArchitecture,
    renderBudgetSummary,
    extinctionForensicsSummary,
    planetExtinctionCause: planetExtinction?.message ?? null,
    originScenarioLabel: originScenarioLabelText,
    worldArchetypeLabel: world.worldArchetypeLabel ?? null,
  }
}

function buildSelectedSpeciesBriefing(
  speciesId: string,
  life: LifeSnapshot,
  agents: AgentSnapshot,
  speciesPopHistory: Map<string, number>,
): SelectedSpeciesBriefing | null {
  const record = life.species.find((s) => s.id === speciesId)
  if (!record) return null
  if (record.population <= 0 && !record.hiddenAsAggregate) return null

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
    lastCauseOfDecline: record.lastCauseOfDecline ?? null,
    hiddenAsAggregate: record.hiddenAsAggregate ?? false,
    convertedToCohort: record.convertedToCohort ?? false,
    populationChangeReason: record.populationChangeReason ?? null,
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
