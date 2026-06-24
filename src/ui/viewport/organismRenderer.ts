import { Graphics } from 'pixi.js'
import type { MobileAgent } from '../../types/agents'
import type { LifeOrganism } from '../../types/life'
import type { OverlayMode, Tile, World } from '../../types/simulation'
import type { AgentVisualState } from '../../types/runtime'
import { maxTileDensity } from '../../simulation/life/LifeSystem'
import { drawOrganicTile, drawDebugTile } from './biomeRenderer'
import { drawAgentGlyph } from './agentGlyphs'
import { drawPlantGlyphsForTile } from './plantGlyphs'
import type { RenderLayers } from './renderLayers'
import { clearAllLayers } from './renderLayers'
import type { TileColorContext } from './tileColors'
import { zoomDetailLevel } from './visualGenes'
import { interpolatedTilePosition, isAgentMoving } from './agentInterpolation'
import { pulseAlpha } from './animationLayer'

export type VisualMode = 'organic' | 'debug'

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
  agentVisualStates: Map<string, AgentVisualState>
  animTimeMs: number
  simTick: number
  activityTiles: number[]
  speciesTileIndices: number[] | null
  selectedSpeciesId: string | null
  selectedTile: Tile | null
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

export function renderWorld(layers: RenderLayers, ctx: OrganismRenderContext): void {
  clearAllLayers(layers)

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
  } = ctx

  const baseContext = buildColorContext(overlay, tileCounts, tileBiomass, activityTiles)
  const speciesSet =
    speciesTileIndices && speciesTileIndices.length > 0
      ? new Set(speciesTileIndices)
      : null
  const detail = zoomDetailLevel(zoom)
  const orgByTile = organismsByTile(organisms, world.width)
  const maxCount = maxTileDensity(tileCounts)
  const drawTile = visualMode === 'organic' ? drawOrganicTile : drawDebugTile

  for (const tile of world.tiles) {
    const idx = tile.y * world.width + tile.x
    const colorContext: TileColorContext | undefined = baseContext
      ? { ...baseContext, tileIndex: idx }
      : undefined

    const g = new Graphics()
    if (visualMode === 'organic') {
      drawOrganicTile(g, tile, tileSize, overlay, colorContext, animTimeMs, simTick)
    } else {
      drawTile(g, tile, tileSize, overlay, colorContext)
    }
    layers.terrain.addChild(g)

    const tileOrgs = orgByTile.get(idx)
    if (tileOrgs && tileOrgs.length > 0 && visualMode === 'organic') {
      const pg = new Graphics()
      drawPlantGlyphsForTile(
        pg,
        tile,
        tileSize,
        tileCounts[idx] ?? 0,
        tileBiomass[idx] ?? 0,
        maxCount,
        tileOrgs,
        detail,
        selectedSpeciesId,
        animTimeMs,
      )
      layers.plants.addChild(pg)
    }
  }

  if (speciesSet) {
    const pulse = pulseAlpha(animTimeMs, 0.22, 0.08)
    for (const idx of speciesSet) {
      const x = idx % world.width
      const y = Math.floor(idx / world.width)
      const highlight = new Graphics()
      highlight.rect(x * tileSize, y * tileSize, tileSize, tileSize)
      highlight.fill({ color: 0xa855f7, alpha: pulse })
      highlight.stroke({ width: 1, color: 0xc084fc, alpha: 0.85 })
      layers.speciesHighlight.addChild(highlight)
    }
  }

  const activitySet = new Set(activityTiles)
  if (activitySet.size > 0) {
    for (const idx of activitySet) {
      if (overlay !== 'life' && overlay !== 'biomass') continue
      const x = idx % world.width
      const y = Math.floor(idx / world.width)
      const actPulse = pulseAlpha(animTimeMs + idx, 0.45, 0.35)
      const pulse = new Graphics()
      pulse.rect(x * tileSize, y * tileSize, tileSize, tileSize)
      pulse.stroke({ width: 1, color: 0xfbbf24, alpha: actPulse })
      layers.activity.addChild(pulse)
    }
  }

  const maxAgentsToDraw = detail === 'close' ? 800 : detail === 'medium' ? 600 : 400
  const agentsToDraw = agents.length > maxAgentsToDraw ? agents.slice(0, maxAgentsToDraw) : agents

  for (const agent of agentsToDraw) {
    const visual = agentVisualStates.get(agent.id)
    const pos = visual ? interpolatedTilePosition(visual) : { x: agent.x, y: agent.y }
    const cx = pos.x * tileSize + tileSize / 2
    const cy = pos.y * tileSize + tileSize / 2
    const isSelectedSpecies = agent.speciesId === selectedSpeciesId
    const moving = visual ? isAgentMoving(visual) : false

    const ag = new Graphics()
    if (visualMode === 'organic') {
      drawAgentGlyph(ag, agent, cx, cy, tileSize, detail, isSelectedSpecies, {
        phaseMs: animTimeMs,
        moving,
      })
    } else {
      let color = 0x4ade80
      if (agent.trophicRole === 'predator') color = 0xf87171
      else if (agent.trophicRole === 'scavenger') color = 0xfbbf24
      const radius = isSelectedSpecies ? tileSize * 0.28 : tileSize * 0.2
      ag.circle(cx, cy, radius)
      ag.fill({ color, alpha: isSelectedSpecies ? 0.95 : 0.82 })
      if (isSelectedSpecies) {
        ag.stroke({ width: 1, color: 0xffffff, alpha: 0.7 })
      }
    }
    layers.agents.addChild(ag)
  }

  if (selectedTile) {
    const outline = new Graphics()
    outline.rect(
      selectedTile.x * tileSize,
      selectedTile.y * tileSize,
      tileSize,
      tileSize,
    )
    outline.stroke({ width: 2, color: 0x22d3ee, alpha: 0.95 })
    layers.selection.addChild(outline)
  }
}
