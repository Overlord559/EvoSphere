import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism } from '../../types/life'
import type { OverlayMode, Tile, World } from '../../types/simulation'
import type { AgentVisualState } from '../../types/runtime'
import type { PopulationUnit } from '../../simulation/ecology/populationUnits'
import { maxTileDensity } from '../../simulation/life/LifeSystem'
import { drawOrganicTile, drawDebugTile, drawVoidTile } from './biomeRenderer'
import { drawAgentGlyph } from './agentGlyphs'
import { drawPlantGlyphsForTile } from './plantGlyphs'
import { drawCohortGlyph } from './cohortGlyphs'
import type { RenderLayers } from './renderLayers'
import {
  clearAllLayerGraphics,
  clearAnimatedLayerGraphics,
} from './renderLayers'
import type { TileColorContext } from './tileColors'
import { interpolatedTilePosition, isAgentMoving } from './agentInterpolation'
import { pulseAlpha } from './animationLayer'
import {
  isTileInBounds,
  tileIndexInBounds,
  type ViewBounds,
} from './viewportCulling'
import {
  MAX_DETAILED_GLYPHS,
  MAX_PLANT_GLYPH_TILES,
} from '../../simulation/engine/stabilityGuards'
import {
  applyRenderBudget,
  renderBudgetMetrics,
  type RenderBudgetMetrics,
} from './renderBudget'
import { drawReseedEffects, type ReseedVisualEffect } from './reseedEffects'
import { drawShowcaseAggregateOverlay } from './showcaseAggregateOverlay'

export type VisualMode = 'organic' | 'debug'

export type RedrawMode = 'full' | 'animated' | 'snapshot'

export interface OrganismRenderContext {
  world: World
  overlay: OverlayMode
  tileSize: number
  zoom: number
  visualMode: VisualMode
  tileCounts: number[]
  tileBiomass: number[]
  organisms: LifeOrganism[]
  agents: MobileAgent[]
  populationUnits?: PopulationUnit[]
  agentVisualStates: Map<string, AgentVisualState>
  animTimeMs: number
  simTick: number
  activityTiles: number[]
  stressTileIds?: number[]
  speciesTileIndices: number[] | null
  selectedSpeciesId: string | null
  selectedTile: Tile | null
  viewBounds: ViewBounds
  skipTerrainRedraw?: boolean
  redrawMode?: RedrawMode
  renderOverload?: boolean
  debugRenderOverride?: boolean
  heightShading?: boolean
  species?: import('../../types/life').SpeciesRecord[]
  recentlyReseededSpeciesIds?: string[]
  recentlyReseededTileIndices?: number[]
  reseedVisualEffects?: ReseedVisualEffect[]
  reseedVisualNowMs?: number
  qualityTier?: import('./renderQualityTier').RenderQualityTier
  /** Showcase / arcade / screenshot — always draw aggregate life overlays. */
  showcaseAggregateMode?: boolean
  showcaseEraLabel?: string
  showcaseSnapshot?: import('../../types/simulation').SimulationSnapshot
}

export interface RenderStats {
  drawnTiles: number
  drawnAgents: number
  drawnPlantTiles: number
  drawnCohortGlyphs: number
  lodLevel: 'far' | 'medium' | 'close'
  terrainRedrawn: boolean
  renderBudget: RenderBudgetMetrics
}

function buildColorContext(
  overlay: OverlayMode,
  tileCounts: number[],
  tileBiomass: number[],
  activityTiles: number[],
): TileColorContext | undefined {
  if (overlay !== 'life' && overlay !== 'biomass') return undefined
  return {
    tileIndex: 0,
    tileCounts,
    tileBiomass,
    maxTileCount: maxTileDensity(tileCounts),
    maxTileBiomass: Math.max(0.01, ...tileBiomass),
    activityTiles: activityTiles.length > 0 ? new Set(activityTiles) : undefined,
  }
}

function organismsByTile(organisms: LifeOrganism[], width: number): Map<number, LifeOrganism[]> {
  const map = new Map<number, LifeOrganism[]>()
  for (const o of organisms) {
    const idx = o.y * width + o.x
    const list = map.get(idx)
    if (list) list.push(o)
    else map.set(idx, [o])
  }
  return map
}

export function renderWorld(layers: RenderLayers, ctx: OrganismRenderContext): RenderStats {
  const redrawMode = ctx.redrawMode ?? (ctx.skipTerrainRedraw ? 'animated' : 'full')
  const skipTerrain = redrawMode === 'animated'

  if (skipTerrain) {
    clearAnimatedLayerGraphics(layers)
  } else {
    clearAllLayerGraphics(layers)
  }

  const {
    world,
    overlay,
    tileSize,
    zoom,
    visualMode,
    tileCounts,
    tileBiomass,
    organisms,
    agents,
    agentVisualStates,
    animTimeMs,
    simTick,
    activityTiles,
    speciesTileIndices,
    selectedSpeciesId,
    selectedTile,
    viewBounds,
    heightShading,
  } = ctx

  const selectedTileIndex =
    selectedTile != null ? selectedTile.y * world.width + selectedTile.x : null

  const budget = applyRenderBudget(
    {
      zoom,
      viewBounds,
      agents,
      organisms,
      populationUnits: ctx.populationUnits,
      species: ctx.species,
      selectedSpeciesId,
      selectedTileIndex,
      recentlyReseededSpeciesIds: ctx.recentlyReseededSpeciesIds,
      recentlyReseededTileIndices: ctx.recentlyReseededTileIndices,
      debugOverride: ctx.debugRenderOverride,
      overload: ctx.renderOverload,
      qualityTier: ctx.qualityTier,
    },
    world.width,
  )

  const metrics = renderBudgetMetrics(budget)
  const detail = budget.lodLevel
  const densityOnly = budget.densityOnlyMode

  const baseContext = buildColorContext(overlay, tileCounts, tileBiomass, activityTiles)
  const speciesSet =
    speciesTileIndices && speciesTileIndices.length > 0
      ? new Set(speciesTileIndices)
      : null
  const orgByTile = organismsByTile(organisms, world.width)
  const maxCount = maxTileDensity(tileCounts)
  const drawTile = visualMode === 'organic' ? drawOrganicTile : drawDebugTile

  let drawnTiles = 0
  let drawnPlantTiles = 0
  let detailedGlyphs = 0

  const terrainG = layers.graphics.terrain
  const plantsG = layers.graphics.plants

  if (!skipTerrain) {
    for (let y = viewBounds.minTileY; y <= viewBounds.maxTileY; y++) {
      for (let x = viewBounds.minTileX; x <= viewBounds.maxTileX; x++) {
        const idx = y * world.width + x
        const tile = world.tiles[idx]
        if (!tile) continue

        if (tile.terrain === 'void' || !world.activeMask[idx]) {
          drawVoidTile(terrainG, x * tileSize, y * tileSize, tileSize)
          drawnTiles += 1
          continue
        }

        const colorContext: TileColorContext | undefined = baseContext
          ? { ...baseContext, tileIndex: idx }
          : undefined

        if (visualMode === 'organic') {
          drawOrganicTile(terrainG, tile, tileSize, overlay, colorContext, animTimeMs, simTick, heightShading)
        } else {
          drawTile(terrainG, tile, tileSize, overlay, colorContext)
        }
        drawnTiles += 1

        if (densityOnly && overlay !== 'life' && overlay !== 'biomass' && !ctx.showcaseAggregateMode) continue

        const tileOrgs = orgByTile.get(idx)
        const hasProducerUnit = budget.producerUnitsToDraw.some((u) => u.tileIndex === idx)
        const hasStaticMarker = budget.staticMarkersToDraw.some((u) => u.tileIndex === idx)
        const hasDensityOverlay = budget.densityOverlayUnits.some((u) => u.tileIndex === idx)
        if (
          (tileOrgs && tileOrgs.length > 0) ||
          hasProducerUnit ||
          hasStaticMarker ||
          hasDensityOverlay ||
          (tileCounts[idx] ?? 0) > 0.5
        ) {
          if (visualMode === 'organic' && drawnPlantTiles < MAX_PLANT_GLYPH_TILES) {
            if (tileOrgs && tileOrgs.length > 0) {
              drawPlantGlyphsForTile(
                plantsG,
                tile,
                tileSize,
                tileCounts[idx] ?? 0,
                tileBiomass[idx] ?? 0,
                maxCount,
                tileOrgs,
                densityOnly ? 'far' : detail === 'close' ? detail : 'medium',
                selectedSpeciesId,
                animTimeMs,
              )
            } else if (hasProducerUnit) {
              const unit = budget.producerUnitsToDraw.find((u) => u.tileIndex === idx)
              if (unit) {
                drawCohortGlyph(
                  plantsG,
                  unit,
                  -1,
                  -1,
                  tileSize,
                  world.width,
                  {
                    phaseMs: animTimeMs,
                    moving: false,
                    isSelectedSpecies: unit.speciesId === selectedSpeciesId,
                    densityOnly,
                    animateFully: budget.animateFully,
                  },
                )
              }
            } else if (hasStaticMarker || hasDensityOverlay) {
              const unit =
                budget.staticMarkersToDraw.find((u) => u.tileIndex === idx) ??
                budget.densityOverlayUnits.find((u) => u.tileIndex === idx)
              if (unit) {
                drawCohortGlyph(
                  plantsG,
                  unit,
                  -1,
                  -1,
                  tileSize,
                  world.width,
                  {
                    phaseMs: animTimeMs,
                    moving: false,
                    isSelectedSpecies: unit.speciesId === selectedSpeciesId,
                    densityOnly: true,
                    animateFully: false,
                  },
                )
              }
            }
            drawnPlantTiles += 1
          }
        }
      }
    }
  }

  if (speciesSet && !densityOnly) {
    const pulse = pulseAlpha(animTimeMs, 0.22, 0.08)
    const highlightG = layers.graphics.speciesHighlight
    for (const idx of speciesSet) {
      if (!tileIndexInBounds(idx, world.width, viewBounds)) continue
      const x = idx % world.width
      const y = Math.floor(idx / world.width)
      highlightG.rect(x * tileSize, y * tileSize, tileSize, tileSize)
      highlightG.fill({ color: 0xa855f7, alpha: pulse })
      highlightG.stroke({ width: 1, color: 0xc084fc, alpha: 0.85 })
    }
  }

  const activitySet = new Set(activityTiles)
  if (activitySet.size > 0 && (overlay === 'life' || overlay === 'biomass')) {
    const activityG = layers.graphics.activity
    for (const idx of activitySet) {
      if (!tileIndexInBounds(idx, world.width, viewBounds)) continue
      const x = idx % world.width
      const y = Math.floor(idx / world.width)
      const actPulse = pulseAlpha(animTimeMs + idx, 0.45, densityOnly ? 0.2 : 0.35)
      activityG.rect(x * tileSize, y * tileSize, tileSize, tileSize)
      activityG.stroke({ width: 1, color: 0xfbbf24, alpha: actPulse })
    }
  }

  const stressSet = ctx.stressTileIds
  if (stressSet && stressSet.length > 0) {
    const stressG = layers.graphics.activity
    for (const idx of stressSet) {
      if (!tileIndexInBounds(idx, world.width, viewBounds)) continue
      const x = idx % world.width
      const y = Math.floor(idx / world.width)
      const stressPulse = pulseAlpha(animTimeMs + idx * 3, 0.35, 0.2)
      stressG.rect(x * tileSize, y * tileSize, tileSize, tileSize)
      stressG.stroke({ width: 1.5, color: 0xf97316, alpha: stressPulse })
    }
  }

  const agentsG = layers.graphics.agents
  let drawnCohortGlyphs = 0

  for (const unit of budget.cohortUnitsToDraw) {
    if (!tileIndexInBounds(unit.tileIndex, world.width, viewBounds)) continue
    drawCohortGlyph(agentsG, unit, -1, -1, tileSize, world.width, {
      phaseMs: animTimeMs,
      moving: !densityOnly,
      isSelectedSpecies: unit.speciesId === selectedSpeciesId,
      densityOnly,
      animateFully: budget.animateFully,
    })
    drawnCohortGlyphs += 1
  }

  for (const unit of budget.staticMarkersToDraw) {
    if (!tileIndexInBounds(unit.tileIndex, world.width, viewBounds)) continue
    if (budget.cohortUnitsToDraw.includes(unit) || budget.producerUnitsToDraw.includes(unit)) continue
    drawCohortGlyph(agentsG, unit, -1, -1, tileSize, world.width, {
      phaseMs: animTimeMs,
      moving: false,
      isSelectedSpecies: unit.speciesId === selectedSpeciesId,
      densityOnly: densityOnly || unit.representedIndividuals > 500,
      animateFully: false,
    })
    drawnCohortGlyphs += 1
  }

  if (ctx.reseedVisualEffects && ctx.reseedVisualEffects.length > 0) {
    drawReseedEffects(agentsG, ctx.reseedVisualEffects, tileSize, ctx.reseedVisualNowMs ?? animTimeMs)
  }

  for (const agent of budget.agentsToDraw) {
    const visual = agentVisualStates.get(agent.id)
    const pos = visual ? interpolatedTilePosition(visual) : { x: agent.x, y: agent.y }
    const cx = pos.x * tileSize + tileSize / 2
    const cy = pos.y * tileSize + tileSize / 2
    const isSelectedSpecies = agent.speciesId === selectedSpeciesId
    const moving = visual ? isAgentMoving(visual) && budget.animateFully : false
    const useDetail =
      detail === 'close' && detailedGlyphs < MAX_DETAILED_GLYPHS && budget.animateFully
        ? detail
        : detail === 'close'
          ? 'medium'
          : detail

    if (visualMode === 'organic') {
      if (densityOnly) {
        drawCohortGlyph(
          agentsG,
          {
            id: agent.id,
            speciesId: agent.speciesId,
            kind: agent.kind,
            unitType: agent.trophicRole === 'predator' ? 'pack' : agent.trophicRole === 'scavenger' ? 'swarm' : 'herd',
            tileIndex: agent.y * world.width + agent.x,
            representedIndividuals: 200,
            biomass: agent.biomass,
            density: 0.5,
            health: agent.health,
            averageEnergy: agent.energy,
            averageAge: 0,
            averageGeneration: agent.generation,
            lastUpdatedTick: 0,
            displayScaleLabel: 'herd',
          },
          cx,
          cy,
          tileSize,
          world.width,
          {
            phaseMs: animTimeMs,
            moving: false,
            isSelectedSpecies,
            densityOnly: true,
            animateFully: false,
          },
        )
        drawnCohortGlyphs += 1
      } else {
        drawAgentGlyph(agentsG, agent, cx, cy, tileSize, useDetail, isSelectedSpecies, {
          phaseMs: animTimeMs,
          moving,
        })
        if (useDetail === 'close') detailedGlyphs += 1
      }
    } else {
      let color = 0x4ade80
      if (agent.trophicRole === 'predator') color = 0xf87171
      else if (agent.trophicRole === 'scavenger') color = 0xfbbf24
      const radius = isSelectedSpecies ? tileSize * 0.28 : tileSize * 0.2
      agentsG.circle(cx, cy, radius)
      agentsG.fill({ color, alpha: isSelectedSpecies ? 0.95 : 0.82 })
      if (isSelectedSpecies) {
        agentsG.stroke({ width: 1, color: 0xffffff, alpha: 0.7 })
      }
    }
  }

  if (selectedTile && isTileInBounds(selectedTile.x, selectedTile.y, viewBounds)) {
    const outline = layers.graphics.selection
    outline.rect(
      selectedTile.x * tileSize,
      selectedTile.y * tileSize,
      tileSize,
      tileSize,
    )
    outline.stroke({ width: 2, color: 0x22d3ee, alpha: 0.95 })
  }

  let showcaseAggregateTiles = 0
  let showcaseAggregateMarkers = 0
  if (ctx.showcaseAggregateMode && ctx.showcaseSnapshot) {
    const agg = drawShowcaseAggregateOverlay(layers.graphics.activity, {
      snapshot: ctx.showcaseSnapshot,
      viewBounds,
      tileSize,
      zoom,
      animTimeMs,
      eraLabel: ctx.showcaseEraLabel,
    })
    showcaseAggregateTiles = agg.microbialTiles
    showcaseAggregateMarkers = agg.producerMarkers + agg.mobileMarkers + agg.settlementMarkers
  }

  return {
    drawnTiles,
    drawnAgents: budget.agentsToDraw.length,
    drawnPlantTiles,
    drawnCohortGlyphs,
    lodLevel: detail,
    terrainRedrawn: !skipTerrain,
    renderBudget: {
      ...metrics,
      showcaseAggregateTiles,
      showcaseAggregateMarkers,
    },
  }
}
