import type { MobileAgent, MobileGenome } from '../../types/agents'
import type { Genome, LifeKind, LifeOrganism } from '../../types/life'
import { entityHash01 } from './visualHash'

export type ZoomDetail = 'far' | 'medium' | 'close'

export function zoomDetailLevel(zoom: number): ZoomDetail {
  if (zoom >= 3) return 'close'
  if (zoom >= 1.5) return 'medium'
  return 'far'
}

export interface AgentVisualTraits {
  bodyScale: number
  bodyWidth: number
  bodyHeight: number
  headScale: number
  eyeScale: number
  mouthScale: number
  tailLength: number
  legCount: number
  appendageLength: number
  finEmphasis: boolean
  antennaCount: number
  clawEmphasis: boolean
  spineEmphasis: boolean
  angularBody: boolean
  compactPosture: boolean
  hue: number
  saturation: number
  brightness: number
  alpha: number
  facingAngle: number
}

export interface ProducerVisualTraits {
  glyphCount: number
  glyphSize: number
  spread: number
  opacity: number
  hue: number
  saturation: number
  brightness: number
  variant: 'algae' | 'mat' | 'stem' | 'canopy' | 'reed' | 'grass' | 'vent'
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function kindHue(kind: string, genome: Genome | MobileGenome): number {
  const base = entityHash01(kind, 17) * 360
  const drift = (genome.energyEfficiency - 0.5) * 40
  return (base + drift + 360) % 360
}

export function agentVisualTraits(agent: MobileAgent): AgentVisualTraits {
  const g = agent.genome
  const healthFactor = clamp01(agent.health)
  const energyFactor = clamp01(agent.energy)
  const biomassScale = 0.75 + clamp01(agent.biomass / 2) * 0.5

  const speed = g.speed
  const stamina = g.stamina
  const sensory = g.sensoryRange / 4
  const hunting = g.huntingEfficiency
  const grazing = g.grazingEfficiency
  const aggression = g.aggression
  const fear = g.fearfulness
  const waterTol = g.waterTolerance

  const isPredator = agent.kind === 'SimplePredator'
  const isScavenger = agent.kind === 'Scavenger'

  let legCount = Math.round(2 + speed * 4)
  if (isScavenger) legCount = Math.max(4, legCount)
  legCount = Math.min(6, legCount)

  const facingAngle = entityHash01(agent.id, 3) * Math.PI * 2

  return {
    bodyScale: biomassScale * (0.85 + stamina * 0.3),
    bodyWidth: isPredator ? 0.55 + hunting * 0.15 : isScavenger ? 0.5 : 0.65 + grazing * 0.1,
    bodyHeight: isPredator ? 0.35 + speed * 0.2 : isScavenger ? 0.45 : 0.5 + stamina * 0.15,
    headScale: isPredator ? 0.35 + aggression * 0.15 : 0.28 + sensory * 0.12,
    eyeScale: 0.08 + sensory * 0.12,
    mouthScale: isPredator ? 0.15 + hunting * 0.2 : 0.1 + grazing * 0.15,
    tailLength: isPredator ? 0.35 + speed * 0.25 : isScavenger ? 0.15 : 0.2 + speed * 0.15,
    legCount,
    appendageLength: 0.15 + speed * 0.2,
    finEmphasis: waterTol > 0.7,
    antennaCount: isScavenger ? Math.round(2 + sensory * 3) : sensory > 0.5 ? 2 : 0,
    clawEmphasis: isPredator && hunting > 0.5,
    spineEmphasis: isPredator && aggression > 0.6,
    angularBody: isPredator || aggression > 0.55,
    compactPosture: fear > 0.55,
    hue: kindHue(agent.kind, g),
    saturation: 0.55 + g.energyEfficiency * 0.25,
    brightness: 0.45 + healthFactor * 0.35 + energyFactor * 0.15,
    alpha: 0.65 + healthFactor * 0.3,
    facingAngle,
  }
}

export function producerVariant(kind: LifeKind, terrain: string): ProducerVisualTraits['variant'] {
  switch (kind) {
    case 'Algae':
      return 'algae'
    case 'ChemosyntheticMicrobe':
      return terrain === 'hydrothermal_vent' ? 'vent' : 'mat'
    case 'PhotosyntheticMicrobe':
    case 'Microbe':
      return 'mat'
    case 'PrimitivePlant':
      if (terrain === 'swamp') return 'reed'
      if (terrain === 'forest') return 'canopy'
      if (terrain === 'grassland') return 'grass'
      return 'stem'
  }
}

export function producerVisualTraits(
  kind: LifeKind,
  genome: Genome,
  biomass: number,
  density: number,
  terrain: string,
): ProducerVisualTraits {
  const densityNorm = clamp01(density)
  const biomassNorm = clamp01(biomass / 3)
  const variant = producerVariant(kind, terrain)

  let glyphCount = Math.round(1 + densityNorm * 4 + biomassNorm * 3)
  if (variant === 'canopy') glyphCount = Math.round(2 + densityNorm * 3)
  if (variant === 'algae') glyphCount = Math.round(2 + densityNorm * 5)

  return {
    glyphCount: Math.min(8, glyphCount),
    glyphSize: 0.25 + biomassNorm * 0.45 + genome.spreadRate * 0.2,
    spread: 0.3 + genome.spreadRate * 0.5,
    opacity: 0.35 + densityNorm * 0.45 + biomassNorm * 0.15,
    hue: kindHue(kind, genome),
    saturation: 0.5 + genome.lightUse * 0.35,
    brightness: 0.4 + genome.energyEfficiency * 0.35,
    variant,
  }
}

export function representativeOrganism(
  organisms: LifeOrganism[],
  speciesId: string | null,
): LifeOrganism | null {
  if (organisms.length === 0) return null
  if (speciesId) {
    const match = organisms.find((o) => o.speciesId === speciesId)
    if (match) return match
  }
  return organisms[0]
}

export function representativeAgent(
  agents: MobileAgent[],
  speciesId: string | null,
): MobileAgent | null {
  if (agents.length === 0) return null
  if (speciesId) {
    const match = agents.find((a) => a.speciesId === speciesId)
    if (match) return match
  }
  return agents[0]
}

export function hslToHex(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c; g = x
  } else if (h < 120) {
    r = x; g = c
  } else if (h < 180) {
    g = c; b = x
  } else if (h < 240) {
    g = x; b = c
  } else if (h < 300) {
    r = x; b = c
  } else {
    r = c; b = x
  }
  const ri = Math.round((r + m) * 255)
  const gi = Math.round((g + m) * 255)
  const bi = Math.round((b + m) * 255)
  return (ri << 16) | (gi << 8) | bi
}

export function traitsToColor(hue: number, sat: number, bright: number, alpha = 1): { color: number; alpha: number } {
  return { color: hslToHex(hue, sat, bright), alpha }
}
