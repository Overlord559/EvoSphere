/** Approximate mapping between simulation ticks and biological / calendar time. */

/** Rough mean ticks between reproductive generations across life kinds. */
export const TICKS_PER_GENERATION_ESTIMATE = 25

/** Simulated years per tick — not 1:1 with generations; tuned for readable deep-time jumps. */
export const TICKS_PER_YEAR = 10

export function tickToGenerations(tick: number): number {
  return Math.floor(tick / TICKS_PER_GENERATION_ESTIMATE)
}

export function tickToYears(tick: number): number {
  return Math.floor(tick / TICKS_PER_YEAR)
}

export function yearsToTicks(years: number): number {
  return Math.max(1, Math.round(years * TICKS_PER_YEAR))
}

export function formatSimYears(years: number): string {
  if (years >= 1_000_000) return `${(years / 1_000_000).toFixed(2)}M yr`
  if (years >= 1_000) return `${(years / 1_000).toFixed(1)}K yr`
  return `${years} yr`
}

export type SimEra =
  | 'Microbial'
  | 'Early Photosynthetic'
  | 'Primitive Plant Colonization'
  | 'Mobile Ecology'

export function eraForTick(
  tick: number,
  hasPlants: boolean,
  hasAlgae: boolean,
  hasMobileAgents = false,
): SimEra {
  if (hasMobileAgents && tick >= 200) return 'Mobile Ecology'
  if (hasPlants && tick >= 500) return 'Primitive Plant Colonization'
  if (hasAlgae || tick >= 150) return 'Early Photosynthetic'
  return 'Microbial'
}
