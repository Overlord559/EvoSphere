export type SymmetryType = 'radial' | 'bilateral' | 'asymmetric'

export type LocomotionType =
  | 'legs'
  | 'fins'
  | 'tentacles'
  | 'crawling'
  | 'hopping'
  | 'gliding'

export type MouthType =
  | 'grazer_beak'
  | 'jaw'
  | 'filter'
  | 'mandible'
  | 'sucker'
  | 'proboscis'

export type SensorType = 'eyes' | 'antennae' | 'vibration' | 'smell' | 'heat' | 'pressure'

export type BodyCovering = 'skin' | 'scales' | 'shell' | 'fur_like' | 'membrane'

export type TailType = 'none' | 'short' | 'long' | 'fin' | 'spined'

/** Latent trait for future tool-use phases — no intelligent manipulation in v0.5. */
export interface BodyPlan {
  symmetryType: SymmetryType
  locomotionType: LocomotionType
  limbCount: number
  manipulatorPotential: number
  mouthType: MouthType
  armorLevel: number
  tailType: TailType
  sensorType: SensorType
  bodyCovering: BodyCovering
  aquaticAdaptation: number
  terrestrialAdaptation: number
  burrowingAdaptation: number
  climbingAdaptation: number
  /** Scaffold only — no flight in v0.5. */
  flightPotential: number
}

export function bodyPlanSummary(plan: BodyPlan): string {
  const parts = [
    plan.symmetryType,
    plan.locomotionType,
    `${plan.limbCount} limbs`,
    plan.mouthType.replace(/_/g, ' '),
    plan.sensorType,
  ]
  if (plan.armorLevel > 0.55) parts.push('armored')
  if (plan.aquaticAdaptation > 0.65) parts.push('aquatic')
  if (plan.terrestrialAdaptation > 0.65) parts.push('terrestrial')
  return parts.join(' · ')
}
