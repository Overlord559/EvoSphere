export type NaturalDisasterFrequency = 'rare' | 'normal' | 'harsh' | 'chaos' | 'manual_only'

export type MassExtinctionFrequency = 'very_rare' | 'rare' | 'normal'

export interface DisasterSettings {
  disasterEnabled: boolean
  naturalDisasterFrequency: NaturalDisasterFrequency
  massExtinctionFrequency: MassExtinctionFrequency
  minimumYearsBetweenMajorDisasters: number
  minimumYearsBetweenMassExtinctions: number
  maximumActiveDisasters: number
  disasterSafeMode: boolean
}

export const DEFAULT_DISASTER_SETTINGS: DisasterSettings = {
  disasterEnabled: true,
  naturalDisasterFrequency: 'normal',
  massExtinctionFrequency: 'very_rare',
  minimumYearsBetweenMajorDisasters: 120,
  minimumYearsBetweenMassExtinctions: 800,
  maximumActiveDisasters: 2,
  disasterSafeMode: true,
}

/** Base probability per 1000 ticks that a natural disaster triggers (before era scaling). */
export function naturalDisasterChancePer1kTicks(freq: NaturalDisasterFrequency): number {
  switch (freq) {
    case 'rare':
      return 0.008
    case 'normal':
      return 0.025
    case 'harsh':
      return 0.07
    case 'chaos':
      return 0.14
    case 'manual_only':
      return 0
    default:
      return 0.025
  }
}

export function massExtinctionChanceMultiplier(freq: MassExtinctionFrequency): number {
  switch (freq) {
    case 'very_rare':
      return 0.15
    case 'rare':
      return 0.4
    case 'normal':
      return 1
    default:
      return 0.15
  }
}

export const GLOBAL_DISASTER_TYPES = new Set([
  'volcanic_winter',
  'ice_age_pulse',
  'asteroid_impact',
  'oxygen_crash',
])

export const MASS_EXTINCTION_TYPES = new Set([
  'asteroid_impact',
  'volcanic_winter',
  'ice_age_pulse',
  'oxygen_crash',
])
