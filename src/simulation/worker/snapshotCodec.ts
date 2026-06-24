import type { MobileAgent } from '../../types/agents'
import type { LifeSnapshot } from '../../types/life'
import type { BriefingSnapshot } from '../../types/runtime'
import type { EventLogEntry, SimulationSnapshot, World } from '../../types/simulation'
import type { AgentSnapshot } from '../../types/agents'
import { AgentSoA } from '../agents/AgentSoA'
import type {
  CompactInspectorPayload,
  CompactRenderPayload,
  CompactSnapshotPayload,
  SnapshotMode,
} from './workerTypes'

const agentSoA = new AgentSoA()

export function encodeSnapshot(
  snapshot: SimulationSnapshot,
  mode: SnapshotMode,
): { payload: CompactRenderPayload | CompactInspectorPayload; transfer: Transferable[] } {
  const { world, life, agents } = snapshot
  agentSoA.syncFromAgents(agents.agents, world.width)

  const tileCounts = new Uint16Array(life.tileCounts)
  const tileBiomass = new Float32Array(life.tileBiomass)
  const tileAgentCounts = new Uint16Array(agents.tileAgentCounts)
  const agentPositions = agentSoA.packPositions()
  const agentSlotIndices = agentSoA.packSlotIndices()

  const base: CompactRenderPayload = {
    mode: 'render',
    tick: snapshot.tick,
    worldId: snapshot.worldId,
    renderSnapshotVersion: snapshot.renderSnapshotVersion,
    lastSnapshotTick: snapshot.lastSnapshotTick,
    tileCounts,
    tileBiomass,
    tileAgentCounts,
    agentPositions,
    agentSlotIndices,
    agentMetaJson: JSON.stringify(buildAgentMeta(agents.agents)),
    speciesOccupancyJson: JSON.stringify(life.speciesOccupancy),
    lifeSummaryJson: JSON.stringify({
      totalOrganisms: life.totalOrganisms,
      totalBiomass: life.totalBiomass,
      species: life.species,
      tileCounts: undefined,
      tileBiomass: undefined,
      organisms: undefined,
    }),
    agentsSummaryJson: JSON.stringify({
      totalAgents: agents.totalAgents,
      totalBiomass: agents.totalBiomass,
      grazerCount: agents.grazerCount,
      predatorCount: agents.predatorCount,
      scavengerCount: agents.scavengerCount,
      foodWebLinks: agents.foodWebLinks,
      dominantGrazerSpeciesId: agents.dominantGrazerSpeciesId,
      dominantPredatorSpeciesId: agents.dominantPredatorSpeciesId,
      speciesSelectionProfiles: agents.speciesSelectionProfiles,
      agents: undefined,
      tileAgentCounts: undefined,
    }),
    briefingJson: JSON.stringify(snapshot.briefing),
    eventsJson: JSON.stringify(snapshot.events),
    lastDeepTimeSummary: snapshot.lastDeepTimeSummary,
    recentActivityTiles: [],
    stabilityWarning: null,
  }

  const transfer: Transferable[] = [
    tileCounts.buffer,
    tileBiomass.buffer,
    tileAgentCounts.buffer,
    agentPositions.buffer,
    agentSlotIndices.buffer,
  ]

  if (mode === 'inspector' || mode === 'full') {
    const inspector: CompactInspectorPayload = {
      mode: 'inspector',
      tick: snapshot.tick,
      worldId: snapshot.worldId,
      renderSnapshotVersion: snapshot.renderSnapshotVersion,
      lastSnapshotTick: snapshot.lastSnapshotTick,
      tileCounts,
      tileBiomass,
      tileAgentCounts,
      agentPositions,
      agentSlotIndices,
      agentMetaJson: base.agentMetaJson,
      speciesOccupancyJson: base.speciesOccupancyJson,
      lifeSummaryJson: base.lifeSummaryJson,
      agentsSummaryJson: base.agentsSummaryJson,
      briefingJson: base.briefingJson,
      eventsJson: base.eventsJson,
      lastDeepTimeSummary: base.lastDeepTimeSummary,
      recentActivityTiles: [],
      stabilityWarning: null,
      organismsJson: JSON.stringify(life.organisms),
      agentsFullJson: JSON.stringify(agents.agents),
    }
    return { payload: inspector, transfer }
  }

  return { payload: base, transfer }
}

function buildAgentMeta(agents: MobileAgent[]): Array<{
  id: string
  speciesId: string
  kind: MobileAgent['kind']
  trophicRole: MobileAgent['trophicRole']
  x: number
  y: number
  energy: number
  health: number
  biomass: number
  lastAction: MobileAgent['lastAction']
  genome: MobileAgent['genome']
  bodyPlan: MobileAgent['bodyPlan']
  senses: MobileAgent['senses']
  currentGoal: MobileAgent['currentGoal']
  environmentalFitness: number
  habitatStress: number
}> {
  return agents.map((a) => ({
    id: a.id,
    speciesId: a.speciesId,
    kind: a.kind,
    trophicRole: a.trophicRole,
    x: a.x,
    y: a.y,
    energy: a.energy,
    health: a.health,
    biomass: a.biomass,
    lastAction: a.lastAction,
    genome: a.genome,
    bodyPlan: a.bodyPlan,
    senses: a.senses,
    currentGoal: a.currentGoal,
    environmentalFitness: a.environmentalFitness,
    habitatStress: a.habitatStress,
  }))
}

export function decodeSnapshot(
  payload: CompactSnapshotPayload,
  world: World,
): SimulationSnapshot {
  const lifePartial = JSON.parse(payload.lifeSummaryJson) as Omit<
    LifeSnapshot,
    'tileCounts' | 'tileBiomass' | 'speciesOccupancy' | 'organisms'
  >
  const agentsPartial = JSON.parse(payload.agentsSummaryJson) as Omit<
    AgentSnapshot,
    'agents' | 'tileAgentCounts'
  >
  const briefing = JSON.parse(payload.briefingJson) as BriefingSnapshot
  const events = JSON.parse(payload.eventsJson) as EventLogEntry[]
  const speciesOccupancy = JSON.parse(payload.speciesOccupancyJson) as LifeSnapshot['speciesOccupancy']

  let organisms: LifeSnapshot['organisms'] = []
  let agentList: MobileAgent[] = []

  if (payload.mode === 'inspector') {
    organisms = JSON.parse(payload.organismsJson)
    agentList = JSON.parse(payload.agentsFullJson)
  } else {
    agentList = JSON.parse(payload.agentMetaJson) as MobileAgent[]
    organisms = []
  }

  const life: LifeSnapshot = {
    ...lifePartial,
    organisms,
    tileCounts: Array.from(payload.tileCounts),
    tileBiomass: Array.from(payload.tileBiomass),
    speciesOccupancy,
  }

  const agents: AgentSnapshot = {
    ...agentsPartial,
    agents: agentList,
    tileAgentCounts: Array.from(payload.tileAgentCounts),
  }

  return {
    tick: payload.tick,
    worldId: payload.worldId,
    world: { ...world, tick: payload.tick },
    events,
    life,
    agents,
    briefing,
    lastDeepTimeSummary: payload.lastDeepTimeSummary,
    renderSnapshotVersion: payload.renderSnapshotVersion,
    lastSnapshotTick: payload.lastSnapshotTick,
    disasters: {
      active: briefing.activeDisasters ?? [],
      recentEnded: [],
      stressTileIds: (briefing.activeDisasters ?? []).flatMap((d) => d.affectedTileIds),
    },
  }
}

export function cloneWorldFromJson(json: string): World {
  return JSON.parse(json) as World
}

export function worldToJson(world: World): string {
  return JSON.stringify(world)
}
