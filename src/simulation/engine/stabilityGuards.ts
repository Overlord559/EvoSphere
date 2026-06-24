import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism } from '../../types/life'
import type { World } from '../../types/simulation'
import { isTileActive } from '../world/planetMask'

export const MAX_EVENTS_RETAINED = 200
export const MAX_AGENTS_DRAWN_FAR = 400
export const MAX_AGENTS_DRAWN_MEDIUM = 600
export const MAX_AGENTS_DRAWN_CLOSE = 800
export const MAX_PLANT_GLYPH_TILES = 2000
export const MAX_DETAILED_GLYPHS = 120
export const RUNAWAY_AGENT_POPULATION = 1200
export const RUNAWAY_ORGANISM_POPULATION = 8000

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
  agent.x = Math.round(agent.x)
  agent.y = Math.round(agent.y)
}

export function clampOrganismVitals(organism: LifeOrganism): void {
  organism.energy = Math.max(0, Math.min(1, organism.energy))
  organism.health = Math.max(0, Math.min(1, organism.health))
  organism.biomass = Math.max(0.01, organism.biomass)
  organism.x = Math.round(organism.x)
  organism.y = Math.round(organism.y)
}
