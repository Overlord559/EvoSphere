import type { MobileGenome } from '../../types/agents'
import type { BodyPlan } from '../../types/bodyPlan'
import type { SensoryProfile } from '../../types/senses'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Derive sensory ranges from genome + body plan — deterministic. */
export function deriveSensoryProfile(genome: MobileGenome, bodyPlan: BodyPlan): SensoryProfile {
  const baseRange = genome.sensoryRange
  const visualBoost = bodyPlan.sensorType === 'eyes' ? 1.4 : bodyPlan.sensorType === 'antennae' ? 0.9 : 0.7
  const smellBoost = bodyPlan.sensorType === 'smell' ? 1.5 : genome.chemicalUse > 0.4 ? 1.2 : 0.8
  const vibrationBoost = bodyPlan.sensorType === 'vibration' ? 1.4 : genome.fearfulness > 0.5 ? 1.1 : 0.85

  return {
    visualRange: clamp(baseRange * visualBoost, 1, 6),
    smellRange: clamp(baseRange * smellBoost * (0.8 + genome.chemicalUse * 0.4), 0.5, 5),
    vibrationRange: clamp(baseRange * vibrationBoost, 0.5, 4),
    heatSensitivity: clamp(
      (genome.heatTolerance + genome.coldTolerance) * 0.4 +
        (bodyPlan.sensorType === 'heat' ? 0.35 : 0.1),
      0,
      1,
    ),
    waterSensitivity: clamp(
      genome.waterTolerance * 0.6 + bodyPlan.aquaticAdaptation * 0.35,
      0,
      1,
    ),
    pressureSensitivity: clamp(
      genome.pressureTolerance * 0.5 +
        (bodyPlan.sensorType === 'pressure' ? 0.35 : 0) +
        bodyPlan.aquaticAdaptation * 0.2,
      0,
      1,
    ),
    primarySensor: bodyPlan.sensorType,
  }
}

export function effectiveSenseRange(senses: SensoryProfile): number {
  return Math.max(senses.visualRange, senses.smellRange, senses.vibrationRange)
}
