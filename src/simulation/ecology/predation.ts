import type { MobileAgent } from '../../types/agents'
import type { Rng } from '../../utils/rng'

export interface PredationResult {
  success: boolean
  energyGain: number
  huntCost: number
  preyId: string | null
  preySpeciesId: string | null
}

export function resolvePredation(
  predator: MobileAgent,
  prey: MobileAgent,
  rng: Rng,
): PredationResult {
  const huntCost = 0.06 + (1 - predator.genome.stamina) * 0.04

  const preyEscape =
    prey.genome.speed * 0.35 +
    prey.genome.stamina * 0.25 +
    prey.health * 0.2 +
    prey.genome.fearfulness * 0.15
  const huntPower =
    predator.genome.huntingEfficiency * 0.45 +
    predator.genome.aggression * 0.25 +
    predator.energy * 0.15 +
    predator.genome.speed * 0.1
  const successChance = Math.max(0.08, Math.min(0.92, huntPower - preyEscape + 0.35))

  if (rng() > successChance) {
    return {
      success: false,
      energyGain: 0,
      huntCost,
      preyId: prey.id,
      preySpeciesId: prey.speciesId,
    }
  }

  const energyGain =
    prey.biomass * predator.genome.digestionEfficiency * predator.genome.energyEfficiency * 0.55

  return {
    success: true,
    energyGain,
    huntCost,
    preyId: prey.id,
    preySpeciesId: prey.speciesId,
  }
}

export function findPreyInRange(
  predator: MobileAgent,
  _agents: MobileAgent[],
  tileAgentIndex: Map<number, MobileAgent[]>,
  worldWidth: number,
): MobileAgent | null {
  const range = Math.max(1, Math.round(predator.genome.sensoryRange))
  const candidates: MobileAgent[] = []

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = predator.x + dx
      const y = predator.y + dy
      const idx = y * worldWidth + x
      const onTile = tileAgentIndex.get(idx)
      if (!onTile) continue
      for (const agent of onTile) {
        if (agent.id === predator.id) continue
        if (agent.trophicRole === 'predator' && predator.kind === 'SimplePredator') continue
        if (agent.trophicRole === 'producer') continue
        if (agent.biomass <= 0.1) continue
        candidates.push(agent)
      }
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const distA = Math.abs(a.x - predator.x) + Math.abs(a.y - predator.y)
    const distB = Math.abs(b.x - predator.x) + Math.abs(b.y - predator.y)
    const scoreA = a.biomass / (1 + distA) - a.genome.speed * 0.2
    const scoreB = b.biomass / (1 + distB) - b.genome.speed * 0.2
    return scoreB - scoreA
  })

  return candidates[0]
}

export function pickHuntTargetTile(
  _predator: MobileAgent,
  prey: MobileAgent,
): { x: number; y: number } {
  return { x: prey.x, y: prey.y }
}
