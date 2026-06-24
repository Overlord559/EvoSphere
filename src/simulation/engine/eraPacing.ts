import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot } from '../../types/life'
import type { SimSpeed } from '../../types/runtime'

/** Simulation era phase — inferred from life/agent state (no civilization yet). */
export type SimEraPhase =
  | 'abiogenesis'
  | 'multicellular'
  | 'complex_ecosystem'
  | 'proto_sentient'
  | 'tribal_tool'
  | 'agricultural'
  | 'industrial_modern_space'

export interface EraPacingProfile {
  phase: SimEraPhase
  label: string
  /** Recommended playback speed when Auto Pace is on. */
  autoSpeed: Exclude<SimSpeed, 'deep'>
  /** Extra ticks per frame budget multiplier (early eras batch harder). */
  batchMultiplier: number
  /** Snapshot interval multiplier (>1 = fewer snapshots). */
  snapshotIntervalMultiplier: number
  /** Event throttle factor baseline. */
  eventThrottleFactor: number
}

const ERA_PROFILES: Record<SimEraPhase, EraPacingProfile> = {
  abiogenesis: {
    phase: 'abiogenesis',
    label: 'Abiogenesis / Microbial',
    autoSpeed: 'ultrafast',
    batchMultiplier: 3,
    snapshotIntervalMultiplier: 4,
    eventThrottleFactor: 6,
  },
  multicellular: {
    phase: 'multicellular',
    label: 'Multicellular / Simple Animals',
    autoSpeed: 'superfast',
    batchMultiplier: 2.5,
    snapshotIntervalMultiplier: 3,
    eventThrottleFactor: 4,
  },
  complex_ecosystem: {
    phase: 'complex_ecosystem',
    label: 'Complex Ecosystem',
    autoSpeed: 'fast',
    batchMultiplier: 2,
    snapshotIntervalMultiplier: 2,
    eventThrottleFactor: 3,
  },
  proto_sentient: {
    phase: 'proto_sentient',
    label: 'Proto-Sentient',
    autoSpeed: 'fast',
    batchMultiplier: 1.5,
    snapshotIntervalMultiplier: 1.5,
    eventThrottleFactor: 2,
  },
  tribal_tool: {
    phase: 'tribal_tool',
    label: 'Tribal / Tool-Using (scaffold)',
    autoSpeed: 'normal',
    batchMultiplier: 1,
    snapshotIntervalMultiplier: 1,
    eventThrottleFactor: 1,
  },
  agricultural: {
    phase: 'agricultural',
    label: 'Agricultural / Settlement (scaffold)',
    autoSpeed: 'normal',
    batchMultiplier: 0.75,
    snapshotIntervalMultiplier: 1,
    eventThrottleFactor: 1,
  },
  industrial_modern_space: {
    phase: 'industrial_modern_space',
    label: 'Industrial / Modern / Space (scaffold)',
    autoSpeed: 'normal',
    batchMultiplier: 0.5,
    snapshotIntervalMultiplier: 0.75,
    eventThrottleFactor: 1,
  },
}

/** Infer current era from observable simulation state — no fake civilization fields. */
export function inferEraPhase(tick: number, life: LifeSnapshot, agents: AgentSnapshot): SimEraPhase {
  const aliveSpecies = life.species.filter((s) => s.population > 0)
  const hasPlants = aliveSpecies.some((s) => s.kind === 'PrimitivePlant')
  const hasMobile = agents.totalAgents > 0
  const hasPredators = agents.predatorCount >= 2

  // Future proto-sentience placeholder: high agent count + long tick
  if (hasMobile && tick >= 5000 && agents.totalAgents >= 40) {
    return 'proto_sentient'
  }
  if (hasPredators && hasPlants && tick >= 800) {
    return 'complex_ecosystem'
  }
  if (hasMobile && tick >= 200) {
    return 'multicellular'
  }
  if (hasPlants || tick >= 150) {
    return 'multicellular'
  }
  return 'abiogenesis'
}

export function eraPacingProfile(
  tick: number,
  life: LifeSnapshot,
  agents: AgentSnapshot,
): EraPacingProfile {
  return ERA_PROFILES[inferEraPhase(tick, life, agents)]
}

export function effectiveSpeedForAutoPace(
  tick: number,
  life: LifeSnapshot,
  agents: AgentSnapshot,
): Exclude<SimSpeed, 'deep'> {
  return eraPacingProfile(tick, life, agents).autoSpeed
}

export function scaledTicksForEra(
  baseTicks: number,
  tick: number,
  life: LifeSnapshot,
  agents: AgentSnapshot,
): number {
  const profile = eraPacingProfile(tick, life, agents)
  return Math.max(1, Math.round(baseTicks * profile.batchMultiplier))
}

export function eraPhaseLabel(phase: SimEraPhase): string {
  return ERA_PROFILES[phase].label
}
