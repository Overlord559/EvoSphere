import type { AgentMemory } from './cognition'
import type { Genome } from './life'
import type { BodyPlan } from './bodyPlan'
import type { SensoryInputSummary, SensoryProfile } from './senses'
import type { SpeciesSelectionProfile } from './selection'

export type AgentKind = 'SimpleGrazer' | 'SimplePredator' | 'Scavenger'

export type TrophicRole = 'producer' | 'grazer' | 'predator' | 'scavenger'

export type AgentGoal =
  | 'find_food'
  | 'graze'
  | 'hunt'
  | 'flee'
  | 'rest'
  | 'wander'
  | 'seek_mate'
  | 'migrate'

export type AgentAction =
  | 'idle'
  | 'move'
  | 'graze'
  | 'hunt'
  | 'eat'
  | 'rest'
  | 'reproduce'
  | 'starve'
  | 'die'

export interface MobileGenome extends Genome {
  speed: number
  stamina: number
  metabolism: number
  sensoryRange: number
  grazingEfficiency: number
  huntingEfficiency: number
  digestionEfficiency: number
  terrainPreference: number
  aggression: number
  fearfulness: number
}

export interface MobileAgent {
  id: string
  speciesId: string
  kind: AgentKind
  trophicRole: TrophicRole
  x: number
  y: number
  energy: number
  health: number
  age: number
  maxAge: number
  hunger: number
  reproductionCooldown: number
  generation: number
  genome: MobileGenome
  bodyPlan: BodyPlan
  senses: SensoryProfile
  currentGoal: AgentGoal
  targetTile: { x: number; y: number } | null
  targetReason: string
  sensoryInput: SensoryInputSummary | null
  habitatStress: number
  environmentalFitness: number
  lastAction: AgentAction
  biomass: number
  /** Tiny inheritable adaptive controller (proto-cognition). */
  controller: import('../simulation/cognition/NeuralController').NeuralController | null
  /** Individual memory — food, danger, preferences. */
  memory: AgentMemory | null
}

export interface FoodWebLink {
  predatorSpeciesId: string
  preySpeciesId: string
  predationCount: number
}

export interface AgentSnapshot {
  agents: MobileAgent[]
  totalAgents: number
  totalBiomass: number
  /** Per-tile mobile agent count (length = world.width * world.height). */
  tileAgentCounts: number[]
  grazerCount: number
  predatorCount: number
  scavengerCount: number
  foodWebLinks: FoodWebLink[]
  dominantGrazerSpeciesId: string | null
  dominantPredatorSpeciesId: string | null
  /** v0.5 species-level selection metrics for mobile species. */
  speciesSelectionProfiles: Record<string, SpeciesSelectionProfile>
}

export const MAX_AGENTS_PER_TILE = 3
export const MAX_TOTAL_AGENTS = 800
export const AGENT_BASE_METABOLISM = 0.022
export const AGENT_REPRODUCTION_ENERGY = 0.68
export const AGENT_REPRODUCTION_COST = 0.38
export const AGENT_HUNGER_RATE = 0.012

export function trophicRoleForKind(kind: AgentKind): TrophicRole {
  switch (kind) {
    case 'SimpleGrazer':
      return 'grazer'
    case 'SimplePredator':
      return 'predator'
    case 'Scavenger':
      return 'scavenger'
  }
}
