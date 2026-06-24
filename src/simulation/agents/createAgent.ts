import { nanoid } from 'nanoid'
import type { AgentKind, MobileAgent, MobileGenome } from '../../types/agents'
import { trophicRoleForKind } from '../../types/agents'
import { createBaseMobileGenome } from '../genetics/agentGenome'

function baseBiomass(kind: AgentKind): number {
  switch (kind) {
    case 'SimpleGrazer':
      return 1.1
    case 'SimplePredator':
      return 1.6
    case 'Scavenger':
      return 0.95
  }
}

export function createAgent(
  kind: AgentKind,
  speciesId: string,
  x: number,
  y: number,
  genome: MobileGenome,
  generation = 0,
): MobileAgent {
  const maxAge = Math.round(genome.lifespan * (0.85 + generation * 0.015))
  return {
    id: nanoid(),
    speciesId,
    kind,
    trophicRole: trophicRoleForKind(kind),
    x,
    y,
    energy: 0.52 + genome.energyEfficiency * 0.18,
    health: 1,
    age: 0,
    maxAge,
    hunger: 0.25,
    reproductionCooldown: Math.round(22 / Math.max(0.12, genome.reproductionRate)),
    generation,
    genome: { ...genome },
    currentGoal: 'wander',
    targetTile: null,
    lastAction: 'idle',
    biomass: baseBiomass(kind) * (0.85 + genome.energyEfficiency * 0.35),
  }
}

export function createFounderAgent(
  kind: AgentKind,
  speciesId: string,
  x: number,
  y: number,
): MobileAgent {
  const genome = createBaseMobileGenome(kind)
  return createAgent(kind, speciesId, x, y, genome, 0)
}

export { createBaseMobileGenome }
