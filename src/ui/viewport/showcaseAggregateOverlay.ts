import { Graphics } from 'pixi.js'
import type { SimulationSnapshot } from '../../types/simulation'
import type { PopulationUnit } from '../../simulation/ecology/populationUnits'
import type { ViewBounds } from './viewportCulling'
import { isTileInBounds, tileIndexInBounds } from './viewportCulling'
import { pulseAlpha } from './animationLayer'
import { maxTileDensity } from '../../simulation/life/LifeSystem'

export interface ShowcaseAggregateInput {
  snapshot: SimulationSnapshot
  viewBounds: ViewBounds
  tileSize: number
  zoom: number
  animTimeMs: number
  eraLabel?: string
}

export interface ShowcaseAggregateStats {
  microbialTiles: number
  producerMarkers: number
  mobileMarkers: number
  settlementMarkers: number
}

/** Screenshot-safe aggregate life visuals — not one object per organism. */
export function drawShowcaseAggregateOverlay(
  g: Graphics,
  input: ShowcaseAggregateInput,
): ShowcaseAggregateStats {
  const { snapshot, viewBounds, tileSize, zoom, animTimeMs } = input
  const { world, life, agents, civilization } = snapshot
  const w = world.width
  const maxCount = maxTileDensity(life.tileCounts)
  const maxBio = Math.max(0.01, ...life.tileBiomass)

  let microbialTiles = 0
  let producerMarkers = 0
  let mobileMarkers = 0
  let settlementMarkers = 0

  const farZoom = zoom < 1.2
  const mediumZoom = zoom >= 1.2 && zoom < 2.5

  for (let y = viewBounds.minTileY; y <= viewBounds.maxTileY; y++) {
    for (let x = viewBounds.minTileX; x <= viewBounds.maxTileX; x++) {
      if (!isTileInBounds(x, y, viewBounds)) continue
      const idx = y * w + x
      const tile = world.tiles[idx]
      if (!tile || tile.terrain === 'void' || !world.activeMask[idx]) continue

      const count = life.tileCounts[idx] ?? 0
      const biomass = life.tileBiomass[idx] ?? 0
      if (count <= 0 && biomass <= 0) continue

      const density = Math.min(1, count / Math.max(1, maxCount))
      const bioDensity = Math.min(1, biomass / maxBio)
      const px = x * tileSize
      const py = y * tileSize

      if (density > 0.02 || bioDensity > 0.02) {
        const alpha = farZoom
          ? 0.18 + density * 0.35
          : mediumZoom
            ? 0.28 + density * 0.42
            : 0.35 + density * 0.45
        const hue = bioDensity > density ? 0x22c55e : 0x14b8a6
        g.rect(px + 1, py + 1, tileSize - 2, tileSize - 2)
        g.fill({ color: hue, alpha })
        microbialTiles += 1
      }
    }
  }

  const units = life.populationUnits ?? []
  const producerUnits = units.filter(
    (u) => u.unitType !== 'herd' && u.unitType !== 'pack' && u.unitType !== 'swarm',
  )
  const mobileUnits = units.filter(
    (u) => u.unitType === 'herd' || u.unitType === 'pack' || u.unitType === 'swarm',
  )

  const drawUnitMarker = (unit: PopulationUnit, color: number, size: number) => {
    const tx = unit.tileIndex % w
    const ty = Math.floor(unit.tileIndex / w)
    if (!tileIndexInBounds(unit.tileIndex, w, viewBounds)) return
    const cx = tx * tileSize + tileSize / 2
    const cy = ty * tileSize + tileSize / 2
    const pulse = pulseAlpha(animTimeMs + unit.tileIndex, 0.55, 0.25)
    g.circle(cx, cy, size)
    g.fill({ color, alpha: pulse })
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.35 })
  }

  const maxProducerDraw = farZoom ? 80 : mediumZoom ? 140 : 200
  for (let i = 0; i < Math.min(producerUnits.length, maxProducerDraw); i++) {
    drawUnitMarker(producerUnits[i]!, 0x4ade80, farZoom ? tileSize * 0.22 : tileSize * 0.28)
    producerMarkers += 1
  }

  const maxMobileDraw = farZoom ? 60 : mediumZoom ? 100 : 160
  for (let i = 0; i < Math.min(mobileUnits.length, maxMobileDraw); i++) {
    const unit = mobileUnits[i]!
    const color =
      unit.unitType === 'pack' ? 0xf87171 : unit.unitType === 'swarm' ? 0xfbbf24 : 0xa78bfa
    drawUnitMarker(unit, color, farZoom ? tileSize * 0.26 : tileSize * 0.32)
    mobileMarkers += 1
  }

  if (agents.agents.length > 0 && mobileUnits.length === 0) {
    const maxAgents = Math.min(agents.agents.length, maxMobileDraw)
    for (let i = 0; i < maxAgents; i++) {
      const agent = agents.agents[i]!
      if (!isTileInBounds(agent.x, agent.y, viewBounds)) continue
      const cx = agent.x * tileSize + tileSize / 2
      const cy = agent.y * tileSize + tileSize / 2
      g.circle(cx, cy, tileSize * 0.24)
      g.fill({ color: 0xa78bfa, alpha: pulseAlpha(animTimeMs + i * 17, 0.7, 0.3) })
      mobileMarkers += 1
    }
  }

  const settlements = civilization?.settlements ?? []
  for (const s of settlements.slice(0, 24)) {
    if (!isTileInBounds(s.x, s.y, viewBounds)) continue
    const cx = s.x * tileSize + tileSize / 2
    const cy = s.y * tileSize + tileSize / 2
    g.rect(cx - tileSize * 0.35, cy - tileSize * 0.35, tileSize * 0.7, tileSize * 0.7)
    g.fill({ color: 0xf59e0b, alpha: 0.75 })
    g.stroke({ width: 1.5, color: 0xfde68a, alpha: 0.9 })
    settlementMarkers += 1
  }

  if (input.eraLabel && !farZoom) {
    const labelX = viewBounds.minTileX * tileSize + 8
    const labelY = viewBounds.minTileY * tileSize + 8
    g.rect(labelX - 4, labelY - 4, Math.min(220, input.eraLabel.length * 7 + 16), 18)
    g.fill({ color: 0x0f172a, alpha: 0.72 })
  }

  return { microbialTiles, producerMarkers, mobileMarkers, settlementMarkers }
}
