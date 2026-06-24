import type { MobileAgent } from '../../types/agents'
import type { SensoryInputSummary } from '../../types/senses'
import type { World } from '../../types/simulation'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'
import { computeTileFitness } from '../ecology/environmentalFitness'

export interface NearbyScanContext {
  tileBiomass: number[]
  tileAgentIndex: Map<number, MobileAgent[]>
}

/** Bounded local scan — O(range²) per agent, no global scans. */
export function scanLocalEnvironment(
  agent: MobileAgent,
  world: World,
  ctx: NearbyScanContext,
): SensoryInputSummary {
  const range = Math.ceil(agent.senses.visualRange + agent.senses.smellRange * 0.5)
  let nearestPreyDist: number | null = null
  let nearestFoodBiomass = 0
  let predatorPressure = 0
  let habitatQuality = 0
  let habitatSamples = 0
  let ventProximity = false

  const tile = getTileAt(world, agent.x, agent.y)
  if (tile?.terrain === 'hydrothermal_vent') ventProximity = true

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = agent.x + dx
      const y = agent.y + dy
      if (!isTileActive(world, x, y)) continue
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist > range) continue

      const idx = y * world.width + x
      const biomass = ctx.tileBiomass[idx] ?? 0
      const smellReach = dist <= agent.senses.smellRange
      const visualReach = dist <= agent.senses.visualRange

      if ((visualReach || smellReach) && biomass > nearestFoodBiomass) {
        nearestFoodBiomass = biomass
      }

      const onTile = ctx.tileAgentIndex.get(idx)
      if (onTile) {
        for (const other of onTile) {
          if (other.id === agent.id) continue
          if (other.trophicRole === 'predator' && agent.trophicRole !== 'predator') {
            if (dist <= agent.senses.vibrationRange + 1) predatorPressure += 1 / (dist + 1)
          }
          if (
            agent.trophicRole === 'predator' &&
            (other.trophicRole === 'grazer' || other.trophicRole === 'scavenger')
          ) {
            if (visualReach || dist <= agent.senses.vibrationRange) {
              if (nearestPreyDist === null || dist < nearestPreyDist) nearestPreyDist = dist
            }
          }
        }
      }

      const t = getTileAt(world, x, y)
      if (t && dist <= 2) {
        habitatQuality += computeTileFitness(agent, t, biomass, predatorPressure)
        habitatSamples += 1
        if (t.terrain === 'hydrothermal_vent' && dist <= agent.senses.waterSensitivity * 3) {
          ventProximity = true
        }
      }
    }
  }

  return {
    nearestPreyDistance: nearestPreyDist,
    nearestFoodBiomass,
    predatorPressure,
    habitatQuality: habitatSamples > 0 ? habitatQuality / habitatSamples : 0.5,
    ventProximity,
  }
}

export function formatSensorySummary(input: SensoryInputSummary): string {
  const parts: string[] = []
  if (input.nearestFoodBiomass > 0.2) parts.push(`food ${input.nearestFoodBiomass.toFixed(1)}`)
  if (input.nearestPreyDistance !== null) parts.push(`prey d${input.nearestPreyDistance}`)
  if (input.predatorPressure > 0.3) parts.push('predators near')
  if (input.ventProximity) parts.push('vent cue')
  if (input.habitatQuality < 0.35) parts.push('habitat stress')
  else if (input.habitatQuality > 0.7) parts.push('good habitat')
  return parts.length > 0 ? parts.join(' · ') : 'scanning'
}
