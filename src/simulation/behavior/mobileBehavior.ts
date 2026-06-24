import type { AgentGoal, MobileAgent } from '../../types/agents'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { neighborOffsets } from '../ecology/colonization'
import { canAgentTraverseTile, pickGrazeTargetTile } from '../ecology/herbivory'
import { findPreyInRange, pickHuntTargetTile } from '../ecology/predation'
import { computeTileFitness } from '../ecology/environmentalFitness'
import { effectiveSenseRange } from '../senses/SenseSystem'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'

export function chooseAgentGoal(
  agent: MobileAgent,
  tileBiomass: number[],
  world: World,
  tileAgentIndex: Map<number, MobileAgent[]>,
  rng: Rng,
): AgentGoal {
  const input = agent.sensoryInput
  const predatorNear = (input?.predatorPressure ?? 0) > 0.35

  if (agent.health < 0.35 || agent.energy < 0.15) return 'rest'
  if (agent.habitatStress > 0.65 && agent.trophicRole !== 'predator') return 'migrate'

  if (agent.hunger > 0.75) {
    if (agent.trophicRole === 'predator') return 'hunt'
    if (agent.trophicRole === 'grazer' || agent.trophicRole === 'scavenger') return 'find_food'
  }
  if (agent.hunger > 0.55 && agent.trophicRole === 'grazer') return 'graze'

  if (predatorNear && agent.genome.fearfulness > 0.35 && agent.trophicRole === 'grazer') {
    return agent.genome.fearfulness > 0.55 ? 'flee' : 'migrate'
  }

  if (agent.energy >= 0.72 && agent.hunger < 0.4 && agent.reproductionCooldown <= 0) {
    if (agent.environmentalFitness > 0.55) {
      return rng() > 0.7 ? 'seek_mate' : 'wander'
    }
  }

  if (agent.hunger > 0.5 && agent.trophicRole !== 'predator') {
    const grazeTarget = pickGrazeTargetTile(agent, world, tileBiomass, rng)
    if (!grazeTarget) return 'migrate'
  }

  if (agent.trophicRole === 'predator' && agent.hunger > 0.45) {
    const prey = findPreyInRange(agent, [], tileAgentIndex, world.width, agent.senses.visualRange)
    if (!prey) return 'migrate'
    return 'hunt'
  }

  if ((input?.nearestFoodBiomass ?? 0) < 0.1 && agent.senses.visualRange < 2.5) {
    return rng() > 0.4 ? 'wander' : 'migrate'
  }

  return rng() > 0.65 ? 'wander' : 'rest'
}

export function goalTargetReason(agent: MobileAgent, goal: AgentGoal): string {
  const input = agent.sensoryInput
  switch (goal) {
    case 'hunt':
      return input?.nearestPreyDistance != null
        ? `prey sensed at d${input.nearestPreyDistance}`
        : 'seeking prey'
    case 'find_food':
    case 'graze':
      return input && input.nearestFoodBiomass > 0.2
        ? `biomass ${input.nearestFoodBiomass.toFixed(1)} in range`
        : 'seeking biomass'
    case 'flee':
      return input && input.predatorPressure > 0.3 ? 'predator pressure' : 'threat avoidance'
    case 'migrate':
      return agent.habitatStress > 0.5 ? 'habitat stress' : 'better forage'
    case 'seek_mate':
      return 'fit habitat reproduction'
    case 'rest':
      return agent.energy < 0.2 ? 'low energy' : 'recovering'
    default:
      return input?.habitatQuality != null && input.habitatQuality < 0.4
        ? 'poor senses / wandering'
        : 'exploring'
  }
}

export function pickMoveTarget(
  agent: MobileAgent,
  goal: AgentGoal,
  world: World,
  tileBiomass: number[],
  tileAgentIndex: Map<number, MobileAgent[]>,
  rng: Rng,
): { x: number; y: number } | null {
  switch (goal) {
    case 'find_food':
    case 'graze': {
      const target = pickGrazeTargetTile(agent, world, tileBiomass, rng)
      return target ? { x: target.x, y: target.y } : pickMigrationTarget(agent, world, tileBiomass, rng)
    }
    case 'hunt': {
      const prey = findPreyInRange(agent, [], tileAgentIndex, world.width, agent.senses.visualRange)
      return prey ? pickHuntTargetTile(agent, prey) : pickMigrationTarget(agent, world, tileBiomass, rng)
    }
    case 'flee':
      return pickFleeTarget(agent, tileAgentIndex, world, rng)
    case 'migrate':
      return pickMigrationTarget(agent, world, tileBiomass, rng)
    case 'seek_mate':
    case 'wander':
      return pickWanderTarget(agent, world, rng)
    case 'rest':
      return null
    default:
      return pickWanderTarget(agent, world, rng)
  }
}

export function stepTowardTarget(
  agent: MobileAgent,
  target: { x: number; y: number },
  world: World,
  tileAgentCounts: number[],
  rng: Rng,
): { x: number; y: number; moved: boolean } {
  if (agent.x === target.x && agent.y === target.y) {
    return { x: agent.x, y: agent.y, moved: false }
  }

  const maxPerTile = agent.bodyPlan.locomotionType === 'crawling' ? 4 : 3

  const candidates = neighborOffsets()
    .map(([dx, dy]: [number, number]) => ({ x: agent.x + dx, y: agent.y + dy }))
    .filter(({ x, y }: { x: number; y: number }) => {
      if (!canAgentTraverseTile(agent, world, x, y)) return false
      const idx = y * world.width + x
      if ((tileAgentCounts[idx] ?? 0) >= maxPerTile) return false
      return true
    })

  if (candidates.length === 0) {
    return { x: agent.x, y: agent.y, moved: false }
  }

  candidates.sort((a: { x: number; y: number }, b: { x: number; y: number }) => {
    const distA = Math.abs(a.x - target.x) + Math.abs(a.y - target.y)
    const distB = Math.abs(b.x - target.x) + Math.abs(b.y - target.y)
    return distA - distB
  })

  const bestDist = Math.abs(candidates[0].x - target.x) + Math.abs(candidates[0].y - target.y)
  const best = candidates.filter(
    (c: { x: number; y: number }) =>
      Math.abs(c.x - target.x) + Math.abs(c.y - target.y) <= bestDist + 0.5,
  )
  const pick = best[Math.floor(rng() * best.length)]
  return { x: pick.x, y: pick.y, moved: pick.x !== agent.x || pick.y !== agent.y }
}

function pickWanderTarget(agent: MobileAgent, world: World, rng: Rng): { x: number; y: number } {
  const offsets = neighborOffsets()
  const valid = offsets
    .map(([dx, dy]: [number, number]) => ({ x: agent.x + dx, y: agent.y + dy }))
    .filter(({ x, y }: { x: number; y: number }) => canAgentTraverseTile(agent, world, x, y))
  if (valid.length === 0) return { x: agent.x, y: agent.y }
  return valid[Math.floor(rng() * valid.length)]
}

function pickMigrationTarget(
  agent: MobileAgent,
  world: World,
  tileBiomass: number[],
  rng: Rng,
): { x: number; y: number } {
  let best = { x: agent.x, y: agent.y, score: -1 }
  const range = Math.min(6, Math.ceil(effectiveSenseRange(agent.senses) + 1))

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = agent.x + dx
      const y = agent.y + dy
      if (!isTileActive(world, x, y)) continue
      if (!canAgentTraverseTile(agent, world, x, y)) continue
      const idx = y * world.width + x
      const biomass = tileBiomass[idx] ?? 0
      const tile = getTileAt(world, x, y)
      if (!tile) continue
      const fitness = computeTileFitness(agent, tile, biomass, 0)
      const distPenalty = (Math.abs(dx) + Math.abs(dy)) * 0.04
      const score = fitness * 1.4 + biomass * 0.8 + tile.soilFertility * 0.3 - distPenalty
      if (score > best.score) best = { x, y, score }
    }
  }

  if (best.score < 0) return pickWanderTarget(agent, world, rng)
  return { x: best.x, y: best.y }
}

function pickFleeTarget(
  agent: MobileAgent,
  tileAgentIndex: Map<number, MobileAgent[]>,
  world: World,
  rng: Rng,
): { x: number; y: number } {
  const senseRange = Math.ceil(agent.senses.vibrationRange + 1)
  let threatX = agent.x
  let threatY = agent.y
  let threats = 0

  for (let dy = -senseRange; dy <= senseRange; dy++) {
    for (let dx = -senseRange; dx <= senseRange; dx++) {
      const idx = (agent.y + dy) * world.width + (agent.x + dx)
      const onTile = tileAgentIndex.get(idx)
      if (!onTile) continue
      for (const other of onTile) {
        if (other.trophicRole === 'predator') {
          threatX += other.x
          threatY += other.y
          threats += 1
        }
      }
    }
  }

  if (threats === 0) return pickWanderTarget(agent, world, rng)
  const avgX = threatX / (threats + 1)
  const avgY = threatY / (threats + 1)
  const awayX = agent.x + Math.sign(agent.x - avgX) || (rng() > 0.5 ? 1 : -1)
  const awayY = agent.y + Math.sign(agent.y - avgY) || (rng() > 0.5 ? 1 : -1)
  if (canAgentTraverseTile(agent, world, awayX, awayY)) {
    return { x: awayX, y: awayY }
  }
  return pickWanderTarget(agent, world, rng)
}

export { terrainMovementCost, movementEnergyCost } from '../ecology/herbivory'
