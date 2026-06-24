import type { TrophicRole } from '../../types/agents'
import type { AgentKind, MobileGenome } from '../../types/agents'
import { trophicRoleForKind } from '../../types/agents'
import type { EntityKind, LifeKind } from '../../types/life'
import { createBaseGenome } from './genome'

function producerTrophicRole(_kind: LifeKind): TrophicRole {
  return 'producer'
}

export function createBaseMobileGenome(kind: AgentKind): MobileGenome {
  const base = createBaseGenome('Microbe')
  switch (kind) {
    case 'SimpleGrazer':
      return {
        ...base,
        reproductionRate: 0.32,
        mutationRate: 0.04,
        energyEfficiency: 0.58,
        heatTolerance: 0.55,
        coldTolerance: 0.45,
        waterTolerance: 0.65,
        spreadRate: 0.18,
        lifespan: 280,
        speed: 0.72,
        stamina: 0.68,
        metabolism: 0.55,
        sensoryRange: 2,
        grazingEfficiency: 0.78,
        huntingEfficiency: 0.08,
        digestionEfficiency: 0.7,
        terrainPreference: 0.6,
        aggression: 0.15,
        fearfulness: 0.55,
      }
    case 'SimplePredator':
      return {
        ...base,
        reproductionRate: 0.22,
        mutationRate: 0.035,
        energyEfficiency: 0.52,
        heatTolerance: 0.6,
        coldTolerance: 0.5,
        waterTolerance: 0.5,
        spreadRate: 0.12,
        lifespan: 320,
        speed: 0.82,
        stamina: 0.75,
        metabolism: 0.62,
        sensoryRange: 3,
        grazingEfficiency: 0.12,
        huntingEfficiency: 0.82,
        digestionEfficiency: 0.75,
        terrainPreference: 0.5,
        aggression: 0.78,
        fearfulness: 0.25,
      }
    case 'Scavenger':
      return {
        ...base,
        reproductionRate: 0.28,
        mutationRate: 0.045,
        energyEfficiency: 0.5,
        heatTolerance: 0.58,
        coldTolerance: 0.48,
        waterTolerance: 0.55,
        spreadRate: 0.2,
        lifespan: 240,
        speed: 0.65,
        stamina: 0.6,
        metabolism: 0.48,
        sensoryRange: 2,
        grazingEfficiency: 0.45,
        huntingEfficiency: 0.35,
        digestionEfficiency: 0.82,
        terrainPreference: 0.45,
        aggression: 0.35,
        fearfulness: 0.4,
      }
  }
}

export function cloneMobileGenome(genome: MobileGenome): MobileGenome {
  return { ...genome }
}

export function entityTrophicRole(kind: EntityKind): TrophicRole {
  if (kind === 'SimpleGrazer' || kind === 'SimplePredator' || kind === 'Scavenger') {
    return trophicRoleForKind(kind)
  }
  return producerTrophicRole(kind as LifeKind)
}

export function mobileGenomesDiverged(a: MobileGenome, b: MobileGenome, threshold = 0.14): boolean {
  const keys = Object.keys(a) as (keyof MobileGenome)[]
  let delta = 0
  for (const key of keys) {
    delta += Math.abs(a[key] - b[key])
  }
  return delta / keys.length > threshold
}

export { createBaseGenome }
