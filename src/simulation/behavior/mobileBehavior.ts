import type { AgentGoal, MobileAgent } from '../../types/agents'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { neighborOffsets } from '../ecology/colonization'
import { canAgentTraverseTile, pickGrazeTargetTile } from '../ecology/herbivory'
import { findPreyInRange, pickHuntTargetTile } from '../ecology/predation'
import { getTileAt } from '../world/generateWorld'

export function chooseAgentGoal(
  agent: MobileAgent,
  tileBiomass: number[],
  world: World,
  tileAgentIndex: Map<number, MobileAgent[]>,
  rng: Rng,
): AgentGoal {
  if (agent.health < 0.35 || agent.energy < 0.15) return 'rest'
  if (agent.hunger > 0.75) {
    if (agent.trophicRole === 'predator') return 'hunt'
    if (agent.trophicRole === 'grazer' || agent.trophicRole === 'scavenger') return 'find_food'
  }
  if (agent.hunger > 0.55 && agent.trophicRole === 'grazer') return 'graze'

  const nearbyPredators = countNearbyPredators(agent, tileAgentIndex, world.width)
  if (nearbyPredators > 0 && agent.genome.fearfulness > 0.4 && agent.trophicRole === 'grazer') {
    return agent.genome.fearfulness > 0.55 ? 'flee' : 'migrate'
  }

  if (agent.energy >= 0.72 && agent.hunger < 0.4 && agent.reproductionCooldown <= 0) {
    return rng() > 0.7 ? 'seek_mate' : 'wander'
  }

  if (agent.hunger > 0.5 && agent.trophicRole !== 'predator') {
    const grazeTarget = pickGrazeTargetTile(agent, world, tileBiomass, rng)
    if (!grazeTarget) return 'migrate'
  }

  if (agent.trophicRole === 'predator' && agent.hunger > 0.45) {
    const prey = findPreyInRange(agent, [], tileAgentIndex, world.width)
    if (!prey) return 'migrate'
    return 'hunt'
  }

  return rng() > 0.65 ? 'wander' : 'rest'
}

function countNearbyPredators(
  agent: MobileAgent,
  tileAgentIndex: Map<number, MobileAgent[]>,
  worldWidth: number,
): number {
  let count = 0
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const idx = (agent.y + dy) * worldWidth + (agent.x + dx)
      const onTile = tileAgentIndex.get(idx)
      if (!onTile) continue
      for (const other of onTile) {
        if (other.id !== agent.id && other.trophicRole === 'predator') count += 1
      }
    }
  }
  return count
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
      const prey = findPreyInRange(agent, [], tileAgentIndex, world.width)
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

  const candidates = neighborOffsets()
    .map(([dx, dy]: [number, number]) => ({ x: agent.x + dx, y: agent.y + dy }))
    .filter(({ x, y }: { x: number; y: number }) => {
      if (!canAgentTraverseTile(agent, world, x, y)) return false
      const idx = y * world.width + x
      if ((tileAgentCounts[idx] ?? 0) >= 3) return false
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
  const range = 4 + Math.round(agent.genome.sensoryRange)

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = agent.x + dx
      const y = agent.y + dy
      if (!canAgentTraverseTile(agent, world, x, y)) continue
      const idx = y * world.width + x
      const biomass = tileBiomass[idx] ?? 0
      const tile = getTileAt(world, x, y)
      const fertility = tile?.soilFertility ?? 0
      const score = biomass * 1.2 + fertility * 0.4 - (Math.abs(dx) + Math.abs(dy)) * 0.05
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
  let threatX = agent.x
  let threatY = agent.y
  let threats = 0

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
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
