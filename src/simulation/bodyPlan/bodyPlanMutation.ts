import type { BodyPlan } from '../../types/bodyPlan'
import type { Rng } from '../../utils/rng'
import { randomFloat } from '../../utils/rng'

const ENUM_KEYS: (keyof Pick<
  BodyPlan,
  'symmetryType' | 'locomotionType' | 'mouthType' | 'tailType' | 'sensorType' | 'bodyCovering'
>)[] = [
  'symmetryType',
  'locomotionType',
  'mouthType',
  'tailType',
  'sensorType',
  'bodyCovering',
]

const SYMMETRY: BodyPlan['symmetryType'][] = ['radial', 'bilateral', 'asymmetric']
const LOCOMOTION: BodyPlan['locomotionType'][] = [
  'legs',
  'fins',
  'tentacles',
  'crawling',
  'hopping',
  'gliding',
]
const MOUTH: BodyPlan['mouthType'][] = [
  'grazer_beak',
  'jaw',
  'filter',
  'mandible',
  'sucker',
  'proboscis',
]
const TAIL: BodyPlan['tailType'][] = ['none', 'short', 'long', 'fin', 'spined']
const SENSOR: BodyPlan['sensorType'][] = ['eyes', 'antennae', 'vibration', 'smell', 'heat', 'pressure']
const COVERING: BodyPlan['bodyCovering'][] = ['skin', 'scales', 'shell', 'fur_like', 'membrane']

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Slow body-plan mutation — lower rate than genome mutation. */
export function mutateBodyPlan(parent: BodyPlan, rng: Rng, mutationRate: number): BodyPlan {
  const child = { ...parent }
  if (rng() > mutationRate * 0.35) return child

  const roll = rng()
  if (roll < 0.15) {
    const key = ENUM_KEYS[Math.floor(rng() * ENUM_KEYS.length)]
    switch (key) {
      case 'symmetryType':
        child.symmetryType = SYMMETRY[Math.floor(rng() * SYMMETRY.length)]
        break
      case 'locomotionType':
        child.locomotionType = LOCOMOTION[Math.floor(rng() * LOCOMOTION.length)]
        break
      case 'mouthType':
        child.mouthType = MOUTH[Math.floor(rng() * MOUTH.length)]
        break
      case 'tailType':
        child.tailType = TAIL[Math.floor(rng() * TAIL.length)]
        break
      case 'sensorType':
        child.sensorType = SENSOR[Math.floor(rng() * SENSOR.length)]
        break
      case 'bodyCovering':
        child.bodyCovering = COVERING[Math.floor(rng() * COVERING.length)]
        break
    }
  } else {
    child.limbCount = Math.max(2, Math.min(8, child.limbCount + (rng() > 0.5 ? 1 : -1)))
    child.armorLevel = clamp01(child.armorLevel + randomFloat(rng, -0.06, 0.06))
    child.aquaticAdaptation = clamp01(child.aquaticAdaptation + randomFloat(rng, -0.05, 0.05))
    child.terrestrialAdaptation = clamp01(child.terrestrialAdaptation + randomFloat(rng, -0.05, 0.05))
    child.burrowingAdaptation = clamp01(child.burrowingAdaptation + randomFloat(rng, -0.04, 0.04))
    child.manipulatorPotential = clamp01(child.manipulatorPotential + randomFloat(rng, -0.03, 0.03))
  }

  return child
}

export function sanitizeBodyPlan(plan: BodyPlan): BodyPlan {
  return {
    ...plan,
    limbCount: Math.max(2, Math.min(8, Math.round(plan.limbCount))),
    manipulatorPotential: clamp01(plan.manipulatorPotential),
    armorLevel: clamp01(plan.armorLevel),
    aquaticAdaptation: clamp01(plan.aquaticAdaptation),
    terrestrialAdaptation: clamp01(plan.terrestrialAdaptation),
    burrowingAdaptation: clamp01(plan.burrowingAdaptation),
    climbingAdaptation: clamp01(plan.climbingAdaptation),
    flightPotential: clamp01(plan.flightPotential),
  }
}
