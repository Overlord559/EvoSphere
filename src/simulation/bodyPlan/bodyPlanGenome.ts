import type { AgentKind, MobileGenome } from '../../types/agents'
import type { BodyPlan, LocomotionType, MouthType, SensorType } from '../../types/bodyPlan'

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function pickLocomotion(
  kind: AgentKind,
  genome: MobileGenome,
): LocomotionType {
  if (genome.waterTolerance > 0.72 && genome.terrainPreference < 0.45) return 'fins'
  if (kind === 'Scavenger' && genome.terrainPreference < 0.4) return 'crawling'
  if (genome.speed > 0.78 && genome.stamina > 0.65) return 'hopping'
  if (genome.waterTolerance > 0.6 && genome.speed > 0.7) return 'gliding'
  if (kind === 'SimplePredator' && genome.aggression > 0.65) return 'tentacles'
  return 'legs'
}

function pickMouth(kind: AgentKind, genome: MobileGenome): MouthType {
  if (kind === 'SimpleGrazer') {
    return genome.grazingEfficiency > 0.7 ? 'grazer_beak' : 'filter'
  }
  if (kind === 'Scavenger') {
    return genome.digestionEfficiency > 0.75 ? 'mandible' : 'sucker'
  }
  if (genome.huntingEfficiency > 0.75) return 'jaw'
  if (genome.grazingEfficiency > 0.4) return 'proboscis'
  return 'jaw'
}

function pickSensor(genome: MobileGenome): SensorType {
  if (genome.sensoryRange >= 3.5) return 'eyes'
  if (genome.waterTolerance > 0.7) return 'pressure'
  if (genome.chemicalUse > 0.5 || genome.sensoryRange >= 2.5) return 'smell'
  if (genome.fearfulness > 0.55) return 'vibration'
  if (genome.heatTolerance > 0.65 || genome.coldTolerance > 0.65) return 'heat'
  return genome.sensoryRange >= 2 ? 'antennae' : 'vibration'
}

/** Derive a body plan from mobile genome + archetype — deterministic, no randomness. */
export function deriveBodyPlan(kind: AgentKind, genome: MobileGenome): BodyPlan {
  const locomotion = pickLocomotion(kind, genome)
  const aquatic = clamp01(genome.waterTolerance * 0.85 + (locomotion === 'fins' ? 0.25 : 0))
  const terrestrial = clamp01(
    genome.terrainPreference * 0.7 +
      genome.droughtResistance * 0.2 +
      (locomotion === 'legs' || locomotion === 'hopping' ? 0.15 : 0),
  )
  const burrowing = clamp01(
    (kind === 'Scavenger' ? 0.35 : 0.1) +
      genome.fearfulness * 0.25 +
      (genome.terrainPreference < 0.45 ? 0.2 : 0),
  )
  const climbing = clamp01(genome.terrainPreference * 0.15 + (kind === 'SimplePredator' ? 0.2 : 0.05))

  let limbCount = Math.round(2 + genome.speed * 4)
  if (locomotion === 'fins') limbCount = Math.max(2, Math.round(2 + aquatic * 4))
  if (locomotion === 'tentacles') limbCount = Math.max(4, Math.round(4 + genome.aggression * 4))
  if (locomotion === 'crawling') limbCount = Math.max(6, limbCount)
  limbCount = Math.min(8, limbCount)

  const armor = clamp01(genome.fearfulness * 0.45 + (kind === 'SimplePredator' ? genome.aggression * 0.25 : 0.15))
  const covering =
    armor > 0.65 ? 'shell' : armor > 0.45 ? 'scales' : aquatic > 0.65 ? 'membrane' : genome.coldTolerance > 0.6 ? 'fur_like' : 'skin'

  let tailType: BodyPlan['tailType'] = 'none'
  if (kind === 'SimplePredator' && genome.speed > 0.6) tailType = genome.aggression > 0.6 ? 'spined' : 'long'
  else if (locomotion === 'fins') tailType = 'fin'
  else if (genome.speed > 0.65) tailType = 'short'

  let symmetry: BodyPlan['symmetryType'] = 'bilateral'
  if (kind === 'Scavenger' && genome.mutationRate > 0.05) symmetry = 'asymmetric'
  else if (aquatic > 0.75 && genome.speed < 0.55) symmetry = 'radial'

  return {
    symmetryType: symmetry,
    locomotionType: locomotion,
    limbCount,
    manipulatorPotential: clamp01(genome.aggression * 0.15 + genome.grazingEfficiency * 0.1),
    mouthType: pickMouth(kind, genome),
    armorLevel: armor,
    tailType,
    sensorType: pickSensor(genome),
    bodyCovering: covering,
    aquaticAdaptation: aquatic,
    terrestrialAdaptation: terrestrial,
    burrowingAdaptation: burrowing,
    climbingAdaptation: climbing,
    flightPotential: clamp01(genome.speed * 0.2 + genome.stamina * 0.1),
  }
}

export function cloneBodyPlan(plan: BodyPlan): BodyPlan {
  return { ...plan }
}
