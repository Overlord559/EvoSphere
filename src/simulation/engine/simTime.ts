/** Approximate mapping between simulation ticks and biological / calendar time. */

import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot } from '../../types/life'
import type { SimSpeed } from '../../types/runtime'

/** Rough mean ticks between reproductive generations across life kinds. */
export const TICKS_PER_GENERATION_ESTIMATE = 25

/** Simulated years per tick — tuned for readable deep-time jumps. */
export const TICKS_PER_YEAR = 10

/** Simulated days per tick (derived — not calendar-accurate). */
export const TICKS_PER_DAY = TICKS_PER_YEAR / 365

export function tickToGenerations(tick: number): number {
  return Math.floor(tick / TICKS_PER_GENERATION_ESTIMATE)
}

export function tickToYears(tick: number): number {
  return Math.floor(tick / TICKS_PER_YEAR)
}

export function tickToDays(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY)
}

export function yearsToTicks(years: number): number {
  return Math.max(1, Math.round(years * TICKS_PER_YEAR))
}

export function formatSimYears(years: number): string {
  if (years >= 1_000_000) return `${(years / 1_000_000).toFixed(2)}M yr`
  if (years >= 1_000) return `${(years / 1_000).toFixed(1)}K yr`
  return `${years.toLocaleString()} yr`
}

export function formatSimTimeShort(years: number, days: number): string {
  if (years >= 1_000) return formatSimYears(years)
  return `Year ${years}, Day ${days % 365}`
}

export type SimEra =
  | 'Abiogenesis / Simple Life'
  | 'Early Photosynthetic'
  | 'Primitive Plant Colonization'
  | 'Early Food Web'
  | 'Predator-Prey World'

export function eraForTick(
  tick: number,
  hasPlants: boolean,
  hasAlgae: boolean,
  hasMobileAgents: boolean,
  predatorCount: number,
): SimEra {
  if (hasMobileAgents && predatorCount >= 2 && tick >= 150) return 'Predator-Prey World'
  if (hasMobileAgents && tick >= 80) return 'Early Food Web'
  if (hasPlants && tick >= 200) return 'Primitive Plant Colonization'
  if (hasAlgae || tick >= 100) return 'Early Photosynthetic'
  return 'Abiogenesis / Simple Life'
}

export interface SimTimeDisplay {
  internalTick: number
  simulatedYear: number
  simulatedDay: number
  generationEstimate: number
  eraLabel: SimEra
  speedLabel: string
}

export function speedLabelFor(speed: SimSpeed): string {
  switch (speed) {
    case 'normal':
      return 'Normal'
    case 'fast':
      return 'Fast Forward'
    case 'superfast':
      return 'Super Fast Forward'
    case 'ultrafast':
      return 'Ultra Fast Forward'
    case 'deep':
      return 'Deep Time'
  }
}

export function buildSimTimeDisplay(
  tick: number,
  life: LifeSnapshot,
  agents: AgentSnapshot,
  speed: SimSpeed,
): SimTimeDisplay {
  const aliveSpecies = life.species.filter((s) => s.population > 0)
  const hasPlants = aliveSpecies.some((s) => s.kind === 'PrimitivePlant')
  const hasAlgae = aliveSpecies.some((s) => s.kind === 'Algae')

  return {
    internalTick: tick,
    simulatedYear: tickToYears(tick),
    simulatedDay: tickToDays(tick) % 365,
    generationEstimate: tickToGenerations(tick),
    eraLabel: eraForTick(tick, hasPlants, hasAlgae, agents.totalAgents > 0, agents.predatorCount),
    speedLabel: speedLabelFor(speed),
  }
}
