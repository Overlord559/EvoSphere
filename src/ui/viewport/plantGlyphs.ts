import { Graphics } from 'pixi.js'
import type { LifeKind, LifeOrganism } from '../../types/life'
import type { Tile, TerrainType } from '../../types/simulation'
import { producerVisualTraits, traitsToColor, type ZoomDetail } from './visualGenes'
import { hash01, hashAngle, hashRange } from './visualHash'
import { pulseAlpha } from './animationLayer'

const PRODUCER_DENSITY_THRESHOLD = 0.08

export function shouldDrawProducers(tileCount: number, maxCount: number): boolean {
  if (tileCount <= 0) return false
  const density = tileCount / Math.max(1, maxCount)
  return density >= PRODUCER_DENSITY_THRESHOLD || tileCount >= 2
}

function drawAlgaeGlyph(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  salt: number,
): void {
  for (let i = 0; i < 3; i++) {
    const ox = hashRange(salt, i, 1, -size, size)
    const oy = hashRange(salt, i, 2, -size * 0.5, size * 0.5)
    g.moveTo(cx + ox, cy + oy)
    g.bezierCurveTo(
      cx + ox + size * 0.8, cy + oy - size * 0.5,
      cx + ox + size * 1.2, cy + oy + size * 0.3,
      cx + ox + size * 0.6, cy + oy + size * 0.8,
    )
    g.stroke({ width: size * 0.4, color, alpha: alpha * 0.7 })
  }
}

function drawMatGlyph(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
): void {
  g.ellipse(cx, cy, size * 1.2, size * 0.7)
  g.fill({ color, alpha })
  g.ellipse(cx - size * 0.3, cy + size * 0.1, size * 0.5, size * 0.3)
  g.fill({ color, alpha: alpha * 0.6 })
}

function drawStemGlyph(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  detail: ZoomDetail,
): void {
  g.moveTo(cx, cy + size)
  g.lineTo(cx, cy - size * 0.8)
  g.stroke({ width: size * 0.25, color: adjustStem(color, -30), alpha })
  if (detail !== 'far') {
    g.circle(cx - size * 0.4, cy - size * 0.5, size * 0.35)
    g.fill({ color, alpha: alpha * 0.8 })
    g.circle(cx + size * 0.35, cy - size * 0.7, size * 0.3)
    g.fill({ color, alpha: alpha * 0.75 })
  }
}

function drawCanopyGlyph(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  detail: ZoomDetail,
): void {
  g.circle(cx, cy - size * 0.3, size * 0.9)
  g.fill({ color, alpha })
  if (detail === 'close') {
    g.moveTo(cx - size * 0.5, cy)
    g.lineTo(cx - size * 0.3, cy + size * 0.8)
    g.moveTo(cx + size * 0.2, cy)
    g.lineTo(cx + size * 0.1, cy + size * 0.7)
    g.stroke({ width: size * 0.15, color: adjustStem(color, -40), alpha: alpha * 0.7 })
  }
}

function drawReedGlyph(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  detail: ZoomDetail,
): void {
  for (let i = -1; i <= 1; i++) {
    const rx = cx + i * size * 0.35
    g.moveTo(rx, cy + size)
    g.quadraticCurveTo(rx + i * size * 0.2, cy, rx, cy - size * 1.2)
    g.stroke({ width: size * 0.12, color: adjustStem(color, -20), alpha })
  }
  if (detail === 'close') {
    g.moveTo(cx - size * 0.3, cy - size * 0.8)
    g.lineTo(cx + size * 0.3, cy - size * 1.1)
    g.stroke({ width: size * 0.1, color, alpha: alpha * 0.5 })
  }
}

function drawGrassCluster(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
  salt: number,
): void {
  for (let i = 0; i < 4; i++) {
    const ang = hashAngle(salt, i, 3) * 0.4 - 0.2 - Math.PI / 2
    const len = size * hashRange(salt, i, 4, 0.6, 1.2)
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(ang) * len * 0.3, cy + Math.sin(ang) * len)
    g.stroke({ width: size * 0.12, color, alpha })
  }
}

function drawVentMat(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha: number,
): void {
  g.circle(cx, cy, size)
  g.fill({ color: 0x7cfc00, alpha: alpha * 0.35 })
  g.circle(cx, cy, size * 0.6)
  g.fill({ color, alpha })
}

function adjustStem(color: number, delta: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) + delta)
  const g = Math.max(0, ((color >> 8) & 0xff) + delta)
  const b = Math.max(0, (color & 0xff) + delta)
  return (r << 16) | (g << 8) | b
}

function dominantKindOnTile(organisms: LifeOrganism[]): LifeKind {
  const counts = new Map<LifeKind, number>()
  for (const o of organisms) {
    counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1)
  }
  let best: LifeKind = organisms[0].kind
  let bestCount = 0
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind
      bestCount = count
    }
  }
  return best
}

export function drawPlantGlyphsForTile(
  g: Graphics,
  tile: Tile,
  tileSize: number,
  tileCount: number,
  tileBiomass: number,
  maxCount: number,
  organisms: LifeOrganism[],
  detail: ZoomDetail,
  selectedSpeciesId: string | null,
  animPhaseMs = 0,
): void {
  if (!shouldDrawProducers(tileCount, maxCount)) return

  const px = tile.x * tileSize
  const py = tile.y * tileSize
  const representative = organisms[0]
  if (!representative) return

  const kind = dominantKindOnTile(organisms)
  const rep = organisms.find((o) => o.kind === kind) ?? representative
  const densityNorm = tileCount / Math.max(1, maxCount)
  const thinFromOvergraze = densityNorm < 0.15 && tileBiomass < 0.5

  const traits = producerVisualTraits(kind, rep.genome, tileBiomass, densityNorm, tile.terrain)
  let { color, alpha: baseAlpha } = traitsToColor(traits.hue, traits.saturation, traits.brightness, traits.opacity)
  if (thinFromOvergraze) baseAlpha *= 0.55
  else if (densityNorm > 0.5) baseAlpha = Math.min(1, baseAlpha * 1.15)
  baseAlpha *= pulseAlpha(animPhaseMs, 0.85, 0.12)

  const hasSelectedProducer = selectedSpeciesId
    ? organisms.some((o) => o.speciesId === selectedSpeciesId)
    : false
  const alpha = hasSelectedProducer ? Math.min(1, baseAlpha + 0.25) : baseAlpha

  const drawCount = detail === 'far' ? Math.min(2, traits.glyphCount) : traits.glyphCount

  for (let i = 0; i < drawCount; i++) {
    const cx = px + hashRange(tile.x, tile.y, 300 + i, 0.15, 0.85) * tileSize
    const cy = py + hashRange(tile.x, tile.y, 400 + i, 0.15, 0.85) * tileSize
    const size = tileSize * traits.glyphSize * (0.7 + hash01(tile.x, tile.y, 500 + i) * 0.5)

    switch (traits.variant) {
      case 'algae':
        drawAlgaeGlyph(g, cx, cy, size, color, alpha, tile.x * 100 + tile.y + i)
        break
      case 'mat':
        drawMatGlyph(g, cx, cy, size, color, alpha)
        break
      case 'stem':
        drawStemGlyph(g, cx, cy, size, color, alpha, detail)
        break
      case 'canopy':
        drawCanopyGlyph(g, cx, cy, size, color, alpha, detail)
        break
      case 'reed':
        drawReedGlyph(g, cx, cy, size, color, alpha, detail)
        break
      case 'grass':
        drawGrassCluster(g, cx, cy, size, color, alpha, tile.x * 50 + tile.y + i)
        break
      case 'vent':
        drawVentMat(g, cx, cy, size, color, alpha)
        break
    }
  }

  if (hasSelectedProducer) {
    g.rect(px, py, tileSize, tileSize)
    g.stroke({ width: 1, color: 0xc084fc, alpha: 0.5 })
  }
}

export function drawProducerPreview(
  g: Graphics,
  kind: LifeKind,
  genome: import('../../types/life').Genome,
  terrain: TerrainType,
  cx: number,
  cy: number,
  previewSize: number,
): void {
  const traits = producerVisualTraits(kind, genome, 1.5, 0.6, terrain)
  const { color, alpha } = traitsToColor(traits.hue, traits.saturation, traits.brightness, 0.9)
  const size = previewSize * traits.glyphSize

  switch (traits.variant) {
    case 'algae':
      drawAlgaeGlyph(g, cx, cy, size, color, alpha, 42)
      break
    case 'mat':
      drawMatGlyph(g, cx, cy, size, color, alpha)
      break
    case 'stem':
      drawStemGlyph(g, cx, cy, size, color, alpha, 'close')
      break
    case 'canopy':
      drawCanopyGlyph(g, cx, cy, size, color, alpha, 'close')
      break
    case 'reed':
      drawReedGlyph(g, cx, cy, size, color, alpha, 'close')
      break
    case 'grass':
      drawGrassCluster(g, cx, cy, size, color, alpha, 99)
      break
    case 'vent':
      drawVentMat(g, cx, cy, size, color, alpha)
      break
  }
}
