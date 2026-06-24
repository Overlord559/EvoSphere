import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism } from '../../types/life'
import type { PopulationUnit } from '../../simulation/ecology/populationUnits'
import { zoomDetailLevel } from './visualGenes'
import type { ViewBounds } from './viewportCulling'
import { isTileInBounds } from './viewportCulling'

/** v0.5.4e representative rendering caps — moving glyphs only. */
export const RENDER_BUDGET = {
  maxMovingGlyphsDefault: 160,
  maxMovingGlyphsHard: 300,
  maxProducerGlyphsDefault: 120,
  maxDetailedGlyphs: 48,
  maxSelectedSpeciesGlyphs: 80,
  maxGlyphsPerTile: 2,
  farZoomDensityOnlyThreshold: 0.55,
  closeZoomDetailThreshold: 2.2,
} as const

export interface RenderBudgetInput {
  zoom: number
  viewBounds: ViewBounds
  agents: MobileAgent[]
  organisms: LifeOrganism[]
  populationUnits?: PopulationUnit[]
  selectedSpeciesId: string | null
  selectedTileIndex: number | null
  debugOverride?: boolean
  overload?: boolean
}

export interface RenderBudgetResult {
  agentsToDraw: MobileAgent[]
  producerUnitsToDraw: PopulationUnit[]
  cohortUnitsToDraw: PopulationUnit[]
  maxMovingGlyphs: number
  maxProducerGlyphs: number
  skippedMovingGlyphs: number
  skippedProducerGlyphs: number
  densityOnlyMode: boolean
  lodLevel: 'far' | 'medium' | 'close'
  animateFully: boolean
}

function hashPick(id: string, tickSalt: number): number {
  let h = tickSalt
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function sortByPriority<T extends { speciesId: string; x?: number; y?: number; tileIndex?: number }>(
  items: T[],
  worldWidth: number,
  selectedSpeciesId: string | null,
  selectedTileIndex: number | null,
): T[] {
  return [...items].sort((a, b) => {
    const aSel = a.speciesId === selectedSpeciesId ? 0 : 1
    const bSel = b.speciesId === selectedSpeciesId ? 0 : 1
    if (aSel !== bSel) return aSel - bSel

    const aTile = a.tileIndex ?? (a.y != null && a.x != null ? a.y * worldWidth + a.x : -1)
    const bTile = b.tileIndex ?? (b.y != null && b.x != null ? b.y * worldWidth + b.x : -1)
    const aLocal = selectedTileIndex != null && aTile === selectedTileIndex ? 0 : 1
    const bLocal = selectedTileIndex != null && bTile === selectedTileIndex ? 0 : 1
    if (aLocal !== bLocal) return aLocal - bLocal
    return 0
  })
}

/** Deterministic sampled subset for viewport rendering — never draws every representative. */
export function applyRenderBudget(input: RenderBudgetInput, worldWidth: number): RenderBudgetResult {
  const lod = zoomDetailLevel(input.zoom)
  const densityOnlyMode =
    input.zoom < RENDER_BUDGET.farZoomDensityOnlyThreshold ||
    (input.overload === true && !input.debugOverride)

  const maxMoving =
    input.debugOverride && input.overload
      ? RENDER_BUDGET.maxMovingGlyphsHard
      : densityOnlyMode
        ? Math.min(40, RENDER_BUDGET.maxMovingGlyphsDefault)
        : lod === 'close'
          ? Math.min(RENDER_BUDGET.maxMovingGlyphsDefault + 40, RENDER_BUDGET.maxMovingGlyphsHard)
          : RENDER_BUDGET.maxMovingGlyphsDefault

  const maxProducer = densityOnlyMode
    ? Math.min(32, RENDER_BUDGET.maxProducerGlyphsDefault)
    : RENDER_BUDGET.maxProducerGlyphsDefault

  const visibleAgents = input.agents.filter((a) => isTileInBounds(a.x, a.y, input.viewBounds))
  const sortedAgents = sortByPriority(
    visibleAgents,
    worldWidth,
    input.selectedSpeciesId,
    input.selectedTileIndex,
  )

  const tickSalt = sortedAgents.length + (input.selectedSpeciesId?.length ?? 0)
  const sampledAgents = sortedAgents
    .map((a, i) => ({ a, score: hashPick(a.id, tickSalt) + i * 0.001 }))
    .sort((x, y) => x.score - y.score)
    .slice(0, maxMoving)
    .map((x) => x.a)

  const units = input.populationUnits ?? []
  const producerUnits = units.filter((u) => u.unitType !== 'herd' && u.unitType !== 'pack' && u.unitType !== 'swarm')
  const mobileUnits = units.filter((u) => u.unitType === 'herd' || u.unitType === 'pack' || u.unitType === 'swarm')

  const sortedProducers = sortByPriority(producerUnits, worldWidth, input.selectedSpeciesId, input.selectedTileIndex)
  const sampledProducers = sortedProducers.slice(0, maxProducer)

  const maxCohort = Math.max(0, maxMoving - sampledAgents.length)
  const sortedCohorts = sortByPriority(mobileUnits, worldWidth, input.selectedSpeciesId, input.selectedTileIndex)
  const sampledCohorts = sortedCohorts.slice(0, maxCohort)

  const animateFully =
    !densityOnlyMode &&
    lod === 'close' &&
    input.zoom >= RENDER_BUDGET.closeZoomDetailThreshold

  return {
    agentsToDraw: sampledAgents,
    producerUnitsToDraw: sampledProducers,
    cohortUnitsToDraw: sampledCohorts,
    maxMovingGlyphs: maxMoving,
    maxProducerGlyphs: maxProducer,
    skippedMovingGlyphs: Math.max(0, visibleAgents.length - sampledAgents.length),
    skippedProducerGlyphs: Math.max(0, producerUnits.length - sampledProducers.length),
    densityOnlyMode,
    lodLevel: densityOnlyMode ? 'far' : lod,
    animateFully,
  }
}

export interface RenderBudgetMetrics {
  renderedMovingGlyphs: number
  renderedProducerGlyphs: number
  visibleCohortCount: number
  skippedGlyphs: number
  densityOnlyMode: boolean
  maxMovingCap: number
  maxProducerCap: number
}

export function renderBudgetMetrics(result: RenderBudgetResult): RenderBudgetMetrics {
  return {
    renderedMovingGlyphs: result.agentsToDraw.length + result.cohortUnitsToDraw.length,
    renderedProducerGlyphs: result.producerUnitsToDraw.length,
    visibleCohortCount: result.cohortUnitsToDraw.length,
    skippedGlyphs: result.skippedMovingGlyphs + result.skippedProducerGlyphs,
    densityOnlyMode: result.densityOnlyMode,
    maxMovingCap: result.maxMovingGlyphs,
    maxProducerCap: result.maxProducerGlyphs,
  }
}
