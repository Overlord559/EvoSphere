import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism } from '../../types/life'
import type { World } from '../../types/simulation'
import { sanitizeBodyPlan } from '../bodyPlan/bodyPlanMutation'
import { isTileActive } from '../world/planetMask'

export const MAX_EVENTS_RETAINED = 200
export const MAX_AGENTS_DRAWN_FAR = 400
export const MAX_AGENTS_DRAWN_MEDIUM = 600
export const MAX_AGENTS_DRAWN_CLOSE = 800
export const MAX_PLANT_GLYPH_TILES = 2000
export const MAX_DETAILED_GLYPHS = 120
export const RUNAWAY_AGENT_POPULATION = 1200
export const RUNAWAY_ORGANISM_POPULATION = 8000
/** Max offspring created in a single life tick — ecological + safety cap. */
export const MAX_BIRTHS_PER_TICK = 64
/** Run full quarantine/population scans every N internal ticks. */
export const STABILITY_GUARD_INTERVAL = 5
/** Main thread may have at most this many snapshots awaiting apply. */
export const MAX_PENDING_SNAPSHOTS = 2
/** Worker-side cap on render snapshots posted per second. */
export const MAX_WORKER_SNAPSHOTS_PER_SEC = 20
/** Max terrain cache keys per world session. */
export const MAX_TERRAIN_CACHE_ENTRIES = 8
/** Max glyph signature cache entries. */
export const MAX_GLYPH_CACHE_ENTRIES = 512
/** Max species pop history entries (extinct species pruned). */
export const MAX_SPECIES_POP_HISTORY = 256
/** Max retained developments in briefing. */
export const MAX_DEVELOPMENTS_RETAINED = 8

export interface QuarantineReport {
  removedAgents: number
  removedOrganisms: number
  reasons: string[]
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n) && !Number.isNaN(n)
}

export function sanitizeAgent(agent: MobileAgent, world: World): string | null {
  if (!isFiniteNumber(agent.x) || !isFiniteNumber(agent.y)) return 'invalid position'
  if (!isFiniteNumber(agent.energy) || !isFiniteNumber(agent.health)) return 'invalid vitals'
  if (agent.x < 0 || agent.y < 0 || agent.x >= world.width || agent.y >= world.height) {
    return 'out of bounds'
  }
  if (!isTileActive(world, agent.x, agent.y)) return 'inactive tile'
  if (!agent.bodyPlan || !agent.senses) return 'missing body/sense profile'
  if (!isFiniteNumber(agent.environmentalFitness) || !isFiniteNumber(agent.habitatStress)) {
    return 'invalid fitness state'
  }
  return null
}

export function sanitizeOrganism(organism: LifeOrganism, world: World): string | null {
  if (!isFiniteNumber(organism.x) || !isFiniteNumber(organism.y)) return 'invalid position'
  if (!isFiniteNumber(organism.energy) || !isFiniteNumber(organism.health)) return 'invalid vitals'
  if (organism.x < 0 || organism.y < 0 || organism.x >= world.width || organism.y >= world.height) {
    return 'out of bounds'
  }
  if (!isTileActive(world, organism.x, organism.y)) return 'inactive tile'
  return null
}

export function clampAgentVitals(agent: MobileAgent): void {
  agent.energy = Math.max(0, Math.min(1, agent.energy))
  agent.health = Math.max(0, Math.min(1, agent.health))
  agent.hunger = Math.max(0, Math.min(1, agent.hunger))
  agent.habitatStress = Math.max(0, Math.min(1, agent.habitatStress))
  agent.environmentalFitness = Math.max(0, Math.min(1, agent.environmentalFitness))
  agent.x = Math.round(agent.x)
  agent.y = Math.round(agent.y)
  if (agent.bodyPlan) agent.bodyPlan = sanitizeBodyPlan(agent.bodyPlan)
}

export function clampOrganismVitals(organism: LifeOrganism): void {
  organism.energy = Math.max(0, Math.min(1, organism.energy))
  organism.health = Math.max(0, Math.min(1, organism.health))
  organism.biomass = Math.max(0.01, organism.biomass)
  organism.x = Math.round(organism.x)
  organism.y = Math.round(organism.y)
}
