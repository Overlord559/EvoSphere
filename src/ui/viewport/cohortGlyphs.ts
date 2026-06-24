import type { Graphics } from 'pixi.js'
import type { MobileAgent } from '../../types/agents'
import type { PopulationUnit } from '../../simulation/ecology/populationUnits'
import { formatEstimatedPopulation } from '../../simulation/ecology/representationScale'
import { pulseAlpha } from './animationLayer'

export interface CohortDrawOptions {
  phaseMs: number
  moving: boolean
  isSelectedSpecies: boolean
  densityOnly: boolean
  animateFully: boolean
}

function cohortColor(unitType: PopulationUnit['unitType']): number {
  switch (unitType) {
    case 'herd':
      return 0x4ade80
    case 'pack':
      return 0xf87171
    case 'swarm':
      return 0xfbbf24
    case 'bloom':
      return 0x22d3ee
    case 'microbe':
      return 0xa78bfa
    case 'patch':
      return 0x34d399
    default:
      return 0x94a3b8
  }
}

/** One glyph represents an entire cohort/patch — not per-individual dots. */
export function drawCohortGlyph(
  g: Graphics,
  unit: PopulationUnit,
  cx: number,
  cy: number,
  tileSize: number,
  worldWidth: number,
  options: CohortDrawOptions,
): void {
  const x = unit.tileIndex % worldWidth
  const y = Math.floor(unit.tileIndex / worldWidth)
  const px = x * tileSize + tileSize / 2
  const py = y * tileSize + tileSize / 2
  const useX = cx >= 0 ? cx : px
  const useY = cy >= 0 ? cy : py

  const color = cohortColor(unit.unitType)
  const density = Math.min(1, unit.density + unit.representedIndividuals / 1_000_000)
  const baseRadius = tileSize * (0.18 + density * 0.12)
  const pulse = options.densityOnly
    ? 0.35
    : pulseAlpha(options.phaseMs + unit.tileIndex, 0.25, options.animateFully ? 0.12 : 0.04)

  g.circle(useX, useY, baseRadius * (options.isSelectedSpecies ? 1.25 : 1))
  g.fill({ color, alpha: pulse * (options.isSelectedSpecies ? 0.95 : 0.72) })

  if (unit.representedIndividuals > 500 && !options.densityOnly) {
    g.circle(useX, useY, baseRadius * 1.45)
    g.stroke({ width: 1, color, alpha: 0.35 })
  }

  if (options.isSelectedSpecies && tileSize >= 8 && unit.representedIndividuals > 1000) {
    const label = formatEstimatedPopulation(unit.representedIndividuals)
    // density mark — small tick count (visual only, no text engine)
    const marks = Math.min(5, Math.floor(Math.log10(unit.representedIndividuals + 1)))
    for (let i = 0; i < marks; i++) {
      const ang = (i / marks) * Math.PI * 2 + options.phaseMs * 0.0005
      g.circle(useX + Math.cos(ang) * baseRadius * 1.6, useY + Math.sin(ang) * baseRadius * 1.6, 1.2)
      g.fill({ color: 0xffffff, alpha: 0.5 })
    }
    void label
  }
}

export function drawMobileCohortFromAgent(
  g: Graphics,
  agent: MobileAgent,
  cx: number,
  cy: number,
  tileSize: number,
  representedIndividuals: number,
  options: CohortDrawOptions,
): void {
  const unitType =
    agent.trophicRole === 'predator' ? 'pack' : agent.trophicRole === 'scavenger' ? 'swarm' : 'herd'
  drawCohortGlyph(
    g,
    {
      id: agent.id,
      speciesId: agent.speciesId,
      kind: agent.kind,
      unitType,
      tileIndex: 0,
      representedIndividuals,
      biomass: agent.biomass,
      density: Math.min(1, representedIndividuals / 500),
      health: agent.health,
      averageEnergy: agent.energy,
      averageAge: 0,
      averageGeneration: agent.generation,
      lastUpdatedTick: 0,
      displayScaleLabel: unitType,
    },
    cx,
    cy,
    tileSize,
    1,
    options,
  )
}
