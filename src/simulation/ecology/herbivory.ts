import type { MobileAgent } from '../../types/agents'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { getTileAt } from '../world/generateWorld'

const AGENT_MOVE_BASE = 0.035

export interface HerbivoryResult {
  consumed: number
  energyGain: number
  overgrazed: boolean
}

/** Max biomass removable per graze action. */
const MAX_GRAZE_PER_ACTION = 0.35

export function computeGrazeEnergyGain(
  agent: MobileAgent,
  availableBiomass: number,
): HerbivoryResult {
  if (availableBiomass <= 0.05) {
    return { consumed: 0, energyGain: 0, overgrazed: false }
  }

  const appetite = agent.hunger * agent.genome.grazingEfficiency
  const consumed = Math.min(
    MAX_GRAZE_PER_ACTION,
    availableBiomass * 0.25,
    appetite * 0.5,
  )
  const energyGain =
    consumed * agent.genome.digestionEfficiency * agent.genome.energyEfficiency * 1.4
  const overgrazed = availableBiomass - consumed < 0.08

  return { consumed, energyGain, overgrazed }
}

export function terrainMovementCost(
  world: World,
  x: number,
  y: number,
  terrainPreference: number,
): number {
  const tile = getTileAt(world, x, y)
  if (!tile) return 999

  let cost = 0.04
  switch (tile.terrain) {
    case 'mountain':
    case 'volcanic':
      cost = 0.14
      break
    case 'deep_ocean':
      cost = 0.12
      break
    case 'swamp':
    case 'tundra':
      cost = 0.09
      break
    case 'grassland':
    case 'forest':
      cost = 0.05
      break
    default:
      cost = 0.06
  }

  const prefPenalty = Math.abs(0.5 - terrainPreference) * 0.04
  return cost + prefPenalty
}

export function movementEnergyCost(agent: MobileAgent, terrainCost: number): number {
  const speedFactor = 0.5 + agent.genome.speed * 0.5
  const staminaFactor = 1.1 - agent.genome.stamina * 0.35
  return (AGENT_MOVE_BASE + terrainCost) * speedFactor * staminaFactor * agent.genome.metabolism
}

export function canAgentTraverseTile(
  agent: MobileAgent,
  world: World,
  x: number,
  y: number,
): boolean {
  const tile = getTileAt(world, x, y)
  if (!tile) return false

  if (tile.terrain === 'deep_ocean' && agent.kind !== 'Scavenger') {
    const aquatic = agent.bodyPlan?.aquaticAdaptation ?? agent.genome.waterTolerance
    return aquatic > 0.55 || agent.bodyPlan?.locomotionType === 'fins'
  }
  if (tile.terrain === 'mountain' && agent.genome.stamina < 0.35) {
    return (agent.bodyPlan?.climbingAdaptation ?? 0) > 0.45
  }
  if (tile.terrain === 'volcanic' && agent.genome.heatTolerance < 0.45) return false

  return true
}

export function pickGrazeTargetTile(
  agent: MobileAgent,
  world: World,
  tileBiomass: number[],
  rng: Rng,
): { x: number; y: number; biomass: number } | null {
  const smellReach = Math.ceil(agent.senses?.smellRange ?? agent.genome.sensoryRange)
  const visualReach = Math.ceil(agent.senses?.visualRange ?? agent.genome.sensoryRange)
  const range = Math.max(smellReach, visualReach, 1)
  const candidates: { x: number; y: number; biomass: number; score: number }[] = []

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = agent.x + dx
      const y = agent.y + dy
      if (!canAgentTraverseTile(agent, world, x, y)) continue
      const idx = y * world.width + x
      const biomass = tileBiomass[idx] ?? 0
      if (biomass < 0.15) continue
      const dist = Math.abs(dx) + Math.abs(dy)
      const score = biomass / (1 + dist * 0.35)
      candidates.push({ x, y, biomass, score })
    }
  }

  const hereIdx = agent.y * world.width + agent.x
  const hereBiomass = tileBiomass[hereIdx] ?? 0
  if (hereBiomass >= 0.15) {
    candidates.push({ x: agent.x, y: agent.y, biomass: hereBiomass, score: hereBiomass * 1.2 })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, Math.min(4, candidates.length))
  const pick = top[Math.floor(rng() * top.length)]
  return { x: pick.x, y: pick.y, biomass: pick.biomass }
}
