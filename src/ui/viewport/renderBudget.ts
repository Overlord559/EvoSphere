import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism, SpeciesRecord } from '../../types/life'
import type { PopulationUnit } from '../../simulation/ecology/populationUnits'
import { isSpeciesBiologicallyAlive } from '../../simulation/ecology/speciesVisibility'
import { zoomDetailLevel } from './visualGenes'
import type { ViewBounds } from './viewportCulling'
import { isTileInBounds } from './viewportCulling'
import {
  DEFAULT_RENDER_QUALITY_TIER,
  qualityConfigForTier,
  type RenderQualityTier,
} from './renderQualityTier'

/** v0.5.4f representative rendering caps — split moving / static / density budgets. */
export const RENDER_BUDGET = {
  maxMovingGlyphsDefault: 150,
  maxMovingGlyphsHard: 300,
  maxProducerGlyphsDefault: 120,
  maxStaticCohortMarkersDefault: 450,
  maxStaticCohortMarkersHard: 600,
  maxSelectedSpeciesDetailGlyphs: 40,
  minLivingSpeciesMarkersProtected: 32,
  maxGlyphsPerSpeciesMoving: 24,
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
  species?: SpeciesRecord[]
  selectedSpeciesId: string | null
  selectedTileIndex: number | null
  recentlyReseededSpeciesIds?: string[]
  recentlyReseededTileIndices?: number[]
  debugOverride?: boolean
  overload?: boolean
  qualityTier?: RenderQualityTier
}

export interface RenderBudgetResult {
  agentsToDraw: MobileAgent[]
  producerUnitsToDraw: PopulationUnit[]
  cohortUnitsToDraw: PopulationUnit[]
  staticMarkersToDraw: PopulationUnit[]
  densityOverlayUnits: PopulationUnit[]
  maxMovingGlyphs: number
  maxProducerGlyphs: number
  maxStaticMarkers: number
  skippedMovingGlyphs: number
  skippedProducerGlyphs: number
  skippedStaticMarkers: number
  protectedSpeciesMarkers: number
  densityOnlyMode: boolean
  lodLevel: 'far' | 'medium' | 'close'
  animateFully: boolean
  livingSpeciesWithMarker: Set<string>
  qualityTier: RenderQualityTier
  /** Visible candidates before budget sampling. */
  candidateMovingGlyphs: number
  candidateProducerGlyphs: number
  candidateStaticGlyphs: number
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
  recentlyReseededSpeciesIds: string[],
  recentlyReseededTileIndices: number[],
): T[] {
  return [...items].sort((a, b) => {
    const aReseed = recentlyReseededSpeciesIds.includes(a.speciesId) ? 0 : 1
    const bReseed = recentlyReseededSpeciesIds.includes(b.speciesId) ? 0 : 1
    if (aReseed !== bReseed) return aReseed - bReseed

    const aSel = a.speciesId === selectedSpeciesId ? 0 : 1
    const bSel = b.speciesId === selectedSpeciesId ? 0 : 1
    if (aSel !== bSel) return aSel - bSel

    const aTile = a.tileIndex ?? (a.y != null && a.x != null ? a.y * worldWidth + a.x : -1)
    const bTile = b.tileIndex ?? (b.y != null && b.x != null ? b.y * worldWidth + b.x : -1)
    const aLocalTile =
      selectedTileIndex != null && aTile === selectedTileIndex
        ? 0
        : recentlyReseededTileIndices.includes(aTile)
          ? 0
          : 1
    const bLocalTile =
      selectedTileIndex != null && bTile === selectedTileIndex
        ? 0
        : recentlyReseededTileIndices.includes(bTile)
          ? 0
          : 1
    if (aLocalTile !== bLocalTile) return aLocalTile - bLocalTile
    return 0
  })
}

function fairSampleBySpecies<T extends { speciesId: string; id: string }>(
  items: T[],
  maxTotal: number,
  maxPerSpecies: number,
  tickSalt: number,
): T[] {
  if (items.length <= maxTotal) return items

  const bySpecies = new Map<string, T[]>()
  for (const item of items) {
    const list = bySpecies.get(item.speciesId) ?? []
    list.push(item)
    bySpecies.set(item.speciesId, list)
  }

  const picked: T[] = []
  const speciesIds = [...bySpecies.keys()].sort()

  for (const speciesId of speciesIds) {
    const pool = bySpecies.get(speciesId) ?? []
    const sorted = pool
      .map((item, i) => ({ item, score: hashPick(item.id, tickSalt) + i * 0.001 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, maxPerSpecies)
      .map((x) => x.item)
    picked.push(...sorted)
  }

  if (picked.length <= maxTotal) return picked

  return picked
    .map((item, i) => ({ item, score: hashPick(item.id, tickSalt + 7) + i * 0.001 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, maxTotal)
    .map((x) => x.item)
}

function pickMinimumSpeciesMarkers(
  units: PopulationUnit[],
  agents: MobileAgent[],
  species: SpeciesRecord[],
  worldWidth: number,
  viewBounds: ViewBounds,
  selectedSpeciesId: string | null,
  recentlyReseededSpeciesIds: string[],
  maxProtected: number,
): PopulationUnit[] {
  const livingSpecies = species.filter((s) => isSpeciesBiologicallyAlive(s))
  const markers: PopulationUnit[] = []
  const covered = new Set<string>()

  const visibleAgents = agents.filter((a) => isTileInBounds(a.x, a.y, viewBounds))
  for (const agent of visibleAgents) {
    covered.add(agent.speciesId)
  }

  const visibleUnits = units.filter((u) => {
    const x = u.tileIndex % worldWidth
    const y = Math.floor(u.tileIndex / worldWidth)
    return isTileInBounds(x, y, viewBounds)
  })

  const prioritySpecies = [
    ...recentlyReseededSpeciesIds,
    ...(selectedSpeciesId ? [selectedSpeciesId] : []),
    ...livingSpecies.map((s) => s.id),
  ]

  for (const speciesId of prioritySpecies) {
    if (covered.has(speciesId) || markers.length >= maxProtected) continue
    const record = species.find((s) => s.id === speciesId)
    if (!record || !isSpeciesBiologicallyAlive(record)) continue

    const unit = visibleUnits.find((u) => u.speciesId === speciesId)
    if (unit) {
      markers.push(unit)
      covered.add(speciesId)
    }
  }

  return markers
}

/** Deterministic sampled subset for viewport rendering — never draws every representative. */
export function applyRenderBudget(input: RenderBudgetInput, worldWidth: number): RenderBudgetResult {
  const qualityTier = input.qualityTier ?? DEFAULT_RENDER_QUALITY_TIER
  const q = qualityConfigForTier(qualityTier)
  const lod = zoomDetailLevel(input.zoom)
  const densityOnlyMode =
    input.zoom < q.farZoomDensityOnlyThreshold ||
    (input.overload === true && !input.debugOverride) ||
    (q.skipAnimatedDetail && input.zoom < RENDER_BUDGET.closeZoomDetailThreshold)

  const maxMoving =
    input.debugOverride && input.overload
      ? RENDER_BUDGET.maxMovingGlyphsHard
      : densityOnlyMode
        ? Math.min(q.movingGlyphCap * 0.4, q.movingGlyphCap)
        : lod === 'close'
          ? Math.min(q.movingGlyphCap + 30, RENDER_BUDGET.maxMovingGlyphsHard)
          : q.movingGlyphCap

  const maxProducer = densityOnlyMode
    ? Math.min(Math.floor(q.producerGlyphCap * 0.4), q.producerGlyphCap)
    : q.producerGlyphCap

  const maxStatic = densityOnlyMode
    ? q.staticMarkerCap
    : Math.min(RENDER_BUDGET.maxStaticCohortMarkersHard, q.staticMarkerCap)

  const recentlyReseededSpeciesIds = input.recentlyReseededSpeciesIds ?? []
  const recentlyReseededTileIndices = input.recentlyReseededTileIndices ?? []
  const species = input.species ?? []

  const visibleAgents = input.agents.filter((a) => isTileInBounds(a.x, a.y, input.viewBounds))
  const sortedAgents = sortByPriority(
    visibleAgents,
    worldWidth,
    input.selectedSpeciesId,
    input.selectedTileIndex,
    recentlyReseededSpeciesIds,
    recentlyReseededTileIndices,
  )

  const tickSalt = sortedAgents.length + (input.selectedSpeciesId?.length ?? 0)
  const maxPerSpeciesMoving = input.selectedSpeciesId
    ? RENDER_BUDGET.maxSelectedSpeciesDetailGlyphs
    : RENDER_BUDGET.maxGlyphsPerSpeciesMoving

  const sampledAgents = fairSampleBySpecies(
    sortedAgents,
    maxMoving,
    maxPerSpeciesMoving,
    tickSalt,
  )

  const units = input.populationUnits ?? []
  const producerUnits = units.filter(
    (u) => u.unitType !== 'herd' && u.unitType !== 'pack' && u.unitType !== 'swarm',
  )
  const mobileUnits = units.filter(
    (u) => u.unitType === 'herd' || u.unitType === 'pack' || u.unitType === 'swarm',
  )

  const protectedMarkers = pickMinimumSpeciesMarkers(
    units,
    sampledAgents,
    species,
    worldWidth,
    input.viewBounds,
    input.selectedSpeciesId,
    recentlyReseededSpeciesIds,
    RENDER_BUDGET.minLivingSpeciesMarkersProtected,
  )

  const protectedIds = new Set(protectedMarkers.map((u) => u.id))
  const livingSpeciesWithMarker = new Set<string>(sampledAgents.map((a) => a.speciesId))
  for (const m of protectedMarkers) livingSpeciesWithMarker.add(m.speciesId)

  const sortedProducers = sortByPriority(
    producerUnits.filter((u) => !protectedIds.has(u.id)),
    worldWidth,
    input.selectedSpeciesId,
    input.selectedTileIndex,
    recentlyReseededSpeciesIds,
    recentlyReseededTileIndices,
  )
  const sampledProducers = fairSampleBySpecies(
    sortedProducers,
    maxProducer,
    Math.ceil(maxProducer / 4),
    tickSalt + 3,
  )

  const remainingMovingBudget = Math.max(0, maxMoving - sampledAgents.length)
  const sortedCohorts = sortByPriority(
    mobileUnits.filter((u) => !protectedIds.has(u.id)),
    worldWidth,
    input.selectedSpeciesId,
    input.selectedTileIndex,
    recentlyReseededSpeciesIds,
    recentlyReseededTileIndices,
  )
  const sampledCohorts = fairSampleBySpecies(
    sortedCohorts,
    remainingMovingBudget,
    maxPerSpeciesMoving,
    tickSalt + 5,
  )
  for (const c of sampledCohorts) livingSpeciesWithMarker.add(c.speciesId)

  const staticPool = [...protectedMarkers]
  const staticCandidates = [...producerUnits, ...mobileUnits].filter(
    (u) => !protectedIds.has(u.id) && !sampledProducers.includes(u) && !sampledCohorts.includes(u),
  )
  const sortedStatic = sortByPriority(
    staticCandidates,
    worldWidth,
    input.selectedSpeciesId,
    input.selectedTileIndex,
    recentlyReseededSpeciesIds,
    recentlyReseededTileIndices,
  )
  const extraStatic = fairSampleBySpecies(
    sortedStatic,
    Math.max(0, maxStatic - staticPool.length),
    8,
    tickSalt + 9,
  )
  const staticMarkersToDraw = [...staticPool, ...extraStatic].slice(0, maxStatic)
  for (const s of staticMarkersToDraw) livingSpeciesWithMarker.add(s.speciesId)

  const densityOverlayUnits = densityOnlyMode
    ? [...staticMarkersToDraw, ...sampledProducers, ...sampledCohorts].slice(0, maxStatic)
    : []

  const animateFully =
    !densityOnlyMode &&
    lod === 'close' &&
    input.zoom >= RENDER_BUDGET.closeZoomDetailThreshold

  return {
    agentsToDraw: sampledAgents,
    producerUnitsToDraw: sampledProducers,
    cohortUnitsToDraw: sampledCohorts,
    staticMarkersToDraw,
    densityOverlayUnits,
    maxMovingGlyphs: maxMoving,
    maxProducerGlyphs: maxProducer,
    maxStaticMarkers: maxStatic,
    skippedMovingGlyphs: Math.max(0, visibleAgents.length - sampledAgents.length - sampledCohorts.length),
    skippedProducerGlyphs: Math.max(0, producerUnits.length - sampledProducers.length),
    skippedStaticMarkers: Math.max(0, units.length - staticMarkersToDraw.length),
    protectedSpeciesMarkers: protectedMarkers.length,
    densityOnlyMode,
    lodLevel: densityOnlyMode ? 'far' : lod,
    animateFully,
    livingSpeciesWithMarker,
    qualityTier,
    candidateMovingGlyphs: visibleAgents.length + mobileUnits.filter((u) => {
      const x = u.tileIndex % worldWidth
      const y = Math.floor(u.tileIndex / worldWidth)
      return isTileInBounds(x, y, input.viewBounds)
    }).length,
    candidateProducerGlyphs: producerUnits.filter((u) => {
      const x = u.tileIndex % worldWidth
      const y = Math.floor(u.tileIndex / worldWidth)
      return isTileInBounds(x, y, input.viewBounds)
    }).length,
    candidateStaticGlyphs: units.filter((u) => {
      const x = u.tileIndex % worldWidth
      const y = Math.floor(u.tileIndex / worldWidth)
      return isTileInBounds(x, y, input.viewBounds)
    }).length,
  }
}

export interface RenderBudgetMetrics {
  renderedMovingGlyphs: number
  renderedProducerGlyphs: number
  renderedStaticMarkers: number
  visibleCohortCount: number
  skippedGlyphs: number
  skippedMovingGlyphs: number
  skippedProducerGlyphs: number
  skippedStaticMarkers: number
  candidateMovingGlyphs: number
  candidateProducerGlyphs: number
  candidateStaticGlyphs: number
  protectedSpeciesMarkers: number
  densityOnlyMode: boolean
  maxMovingCap: number
  maxProducerCap: number
  maxStaticCap: number
  livingSpeciesMarked: number
  qualityTier?: RenderQualityTier
  showcaseAggregateTiles?: number
  showcaseAggregateMarkers?: number
}

export function renderBudgetMetrics(result: RenderBudgetResult): RenderBudgetMetrics {
  return {
    renderedMovingGlyphs: result.agentsToDraw.length + result.cohortUnitsToDraw.length,
    renderedProducerGlyphs: result.producerUnitsToDraw.length,
    renderedStaticMarkers: result.staticMarkersToDraw.length,
    visibleCohortCount: result.cohortUnitsToDraw.length,
    skippedGlyphs:
      result.skippedMovingGlyphs + result.skippedProducerGlyphs + result.skippedStaticMarkers,
    skippedMovingGlyphs: result.skippedMovingGlyphs,
    skippedProducerGlyphs: result.skippedProducerGlyphs,
    skippedStaticMarkers: result.skippedStaticMarkers,
    candidateMovingGlyphs: result.candidateMovingGlyphs,
    candidateProducerGlyphs: result.candidateProducerGlyphs,
    candidateStaticGlyphs: result.candidateStaticGlyphs,
    protectedSpeciesMarkers: result.protectedSpeciesMarkers,
    densityOnlyMode: result.densityOnlyMode,
    maxMovingCap: result.maxMovingGlyphs,
    maxProducerCap: result.maxProducerGlyphs,
    maxStaticCap: result.maxStaticMarkers,
    livingSpeciesMarked: result.livingSpeciesWithMarker.size,
    qualityTier: result.qualityTier,
  }
}
