export type DisasterType =
  | 'drought'
  | 'flood'
  | 'wildfire'
  | 'volcanic_eruption'
  | 'volcanic_winter'
  | 'ice_age_pulse'
  | 'heat_wave'
  | 'storm'
  | 'earthquake'
  | 'tsunami'
  | 'asteroid_impact'
  | 'disease_outbreak'
  | 'oxygen_crash'

export type DisasterSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic'

export interface ActiveDisaster {
  id: string
  type: DisasterType
  severity: DisasterSeverity
  severityValue: number
  startTick: number
  durationTicks: number
  affectedTileIds: number[]
  centerX: number
  centerY: number
  radius: number
  effectSummary: string
  lifeImpact: string
  agentImpact: string
  biomeImpact: string
}

export interface DisasterSnapshot {
  active: ActiveDisaster[]
  recentEnded: ActiveDisaster[]
  stressTileIds: number[]
}

export const DISASTER_LABELS: Record<DisasterType, string> = {
  drought: 'Drought',
  flood: 'Flood',
  wildfire: 'Wildfire',
  volcanic_eruption: 'Volcanic Eruption',
  volcanic_winter: 'Volcanic Winter',
  ice_age_pulse: 'Ice Age Pulse',
  heat_wave: 'Heat Wave',
  storm: 'Storm / Hurricane',
  earthquake: 'Earthquake',
  tsunami: 'Tsunami',
  asteroid_impact: 'Asteroid Impact',
  disease_outbreak: 'Disease Outbreak',
  oxygen_crash: 'Ecological / Oxygen Crash',
}

export const ALL_DISASTER_TYPES: DisasterType[] = Object.keys(DISASTER_LABELS) as DisasterType[]

export function severityFromValue(value: number): DisasterSeverity {
  if (value >= 0.85) return 'catastrophic'
  if (value >= 0.6) return 'major'
  if (value >= 0.35) return 'moderate'
  return 'minor'
}

export function disasterDurationTicks(type: DisasterType, severityValue: number): number {
  const base: Record<DisasterType, number> = {
    drought: 80,
    flood: 40,
    wildfire: 25,
    volcanic_eruption: 35,
    volcanic_winter: 120,
    ice_age_pulse: 100,
    heat_wave: 30,
    storm: 15,
    earthquake: 5,
    tsunami: 20,
    asteroid_impact: 60,
    disease_outbreak: 50,
    oxygen_crash: 70,
  }
  return Math.round(base[type] * (0.6 + severityValue * 0.8))
}
