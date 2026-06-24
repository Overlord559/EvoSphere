import { Graphics } from 'pixi.js'
import type { OverlayMode, Tile, TerrainType } from '../../types/simulation'
import { colorForTile, visualTerrainForTile, type TileColorContext } from './tileColors'
import { hash01, hashAngle, hashRange } from './visualHash'
import { pulseAlpha, seasonTint, shimmerOffset } from './animationLayer'

function adjustColor(base: number, dr: number, dg: number, db: number): number {
  const r = Math.max(0, Math.min(255, ((base >> 16) & 0xff) + dr))
  const g = Math.max(0, Math.min(255, ((base >> 8) & 0xff) + dg))
  const b = Math.max(0, Math.min(255, (base & 0xff) + db))
  return (r << 16) | (g << 8) | b
}

function drawOrganicPatch(
  g: Graphics,
  px: number,
  py: number,
  size: number,
  color: number,
  alpha: number,
): void {
  g.circle(px, py, size)
  g.fill({ color, alpha })
}

function drawBiomeTexture(
  g: Graphics,
  tile: Tile,
  px: number,
  py: number,
  tileSize: number,
  baseColor: number,
  animPhaseMs = 0,
): void {
  const { x, y } = tile
  const terrain = visualTerrainForTile(tile)
  const detail = tileSize >= 8

  switch (terrain) {
    case 'deep_ocean': {
      const grad = hash01(x, y, 1)
      g.rect(px, py, tileSize, tileSize)
      g.fill(adjustColor(baseColor, grad * 8 - 4, grad * 6 - 3, grad * 10))
      if (detail) {
        for (let i = 0; i < 2; i++) {
          const wx = px + hashRange(x, y, 10 + i, 0.1, 0.9) * tileSize
          const wy = py + hashRange(x, y, 20 + i, 0.2, 0.8) * tileSize
          g.moveTo(wx, wy)
          g.bezierCurveTo(
            wx + tileSize * 0.15, wy - tileSize * 0.05,
            wx + tileSize * 0.3, wy + tileSize * 0.05,
            wx + tileSize * 0.4, wy,
          )
          g.stroke({ width: 0.5, color: adjustColor(baseColor, 15, 20, 30), alpha: 0.25 })
        }
      }
      break
    }
    case 'ocean': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      for (let i = 0; i < 3; i++) {
        drawOrganicPatch(
          g,
          px + hashRange(x, y, 30 + i, 0.15, 0.85) * tileSize,
          py + hashRange(x, y, 40 + i, 0.15, 0.85) * tileSize,
          tileSize * hashRange(x, y, 50 + i, 0.08, 0.18),
          adjustColor(baseColor, 10, 15, 5),
          0.2 + hash01(x, y, 60 + i) * 0.15,
        )
      }
      break
    }
    case 'coast': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      const wetEdge = tile.water > 0.4
      if (wetEdge) {
        g.rect(px, py + tileSize * 0.6, tileSize, tileSize * 0.4)
        g.fill({ color: 0x3498db, alpha: 0.2 + tile.water * 0.25 })
      }
      for (let i = 0; i < 4; i++) {
        drawOrganicPatch(
          g,
          px + hashRange(x, y, 70 + i, 0.1, 0.9) * tileSize,
          py + hashRange(x, y, 80 + i, 0.1, 0.9) * tileSize,
          tileSize * 0.06,
          adjustColor(baseColor, -15, -10, -5),
          0.15,
        )
      }
      break
    }
    case 'barren':
    case 'sand':
    case 'rock':
    case 'basin':
    case 'fertile_plain': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      if (terrain === 'fertile_plain' && detail) {
        for (let i = 0; i < 3; i++) {
          drawOrganicPatch(
            g,
            px + hashRange(x, y, 200 + i, 0.1, 0.9) * tileSize,
            py + hashRange(x, y, 210 + i, 0.5, 0.95) * tileSize,
            tileSize * 0.05,
            adjustColor(baseColor, -10, 5, -8),
            0.2,
          )
        }
      }
      break
    }
    case 'grassland': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      const strokeCount = detail ? 5 : 2
      for (let i = 0; i < strokeCount; i++) {
        const sx = px + hashRange(x, y, 90 + i, 0.1, 0.9) * tileSize
        const sy = py + hashRange(x, y, 100 + i, 0.5, 0.95) * tileSize
        const len = tileSize * hashRange(x, y, 110 + i, 0.15, 0.35)
        const ang = hashAngle(x, y, 120 + i) * 0.3 - 0.15
        g.moveTo(sx, sy)
        g.lineTo(sx + Math.sin(ang) * len, sy - Math.cos(ang) * len)
        g.stroke({ width: 0.6, color: adjustColor(baseColor, -20, 10, -15), alpha: 0.35 })
      }
      break
    }
    case 'forest': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(adjustColor(baseColor, -5, 5, -5))
      const canopyCount = detail ? 3 : 1
      for (let i = 0; i < canopyCount; i++) {
        const cx = px + hashRange(x, y, 130 + i, 0.2, 0.8) * tileSize
        const cy = py + hashRange(x, y, 140 + i, 0.15, 0.55) * tileSize
        const r = tileSize * hashRange(x, y, 150 + i, 0.2, 0.38)
        g.circle(cx, cy, r)
        g.fill({ color: adjustColor(baseColor, 5, 20, 5), alpha: 0.55 + hash01(x, y, 160 + i) * 0.2 })
        if (detail) {
          g.rect(cx - 1, cy + r * 0.5, 2, tileSize * 0.35)
          g.fill({ color: adjustColor(baseColor, -30, -20, -25), alpha: 0.5 })
        }
      }
      break
    }
    case 'desert': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      for (let i = 0; i < 2; i++) {
        const dy = py + hashRange(x, y, 170 + i, 0.3, 0.7) * tileSize
        g.moveTo(px, dy)
        g.bezierCurveTo(
          px + tileSize * 0.3, dy - tileSize * 0.08,
          px + tileSize * 0.7, dy + tileSize * 0.08,
          px + tileSize, dy,
        )
        g.stroke({ width: 0.8, color: adjustColor(baseColor, 15, 5, -10), alpha: 0.3 })
      }
      if (tile.moisture < 0.2 && detail) {
        g.moveTo(px + tileSize * 0.3, py + tileSize * 0.4)
        g.lineTo(px + tileSize * 0.5, py + tileSize * 0.6)
        g.lineTo(px + tileSize * 0.7, py + tileSize * 0.35)
        g.stroke({ width: 0.4, color: adjustColor(baseColor, -25, -20, -15), alpha: 0.25 })
      }
      break
    }
    case 'swamp': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      g.rect(px, py, tileSize, tileSize)
      g.fill({ color: 0x0a1a12, alpha: 0.22 + tile.moisture * 0.25 })
      if (detail) {
        for (let i = 0; i < 4; i++) {
          const rx = px + hashRange(x, y, 180 + i, 0.15, 0.85) * tileSize
          g.moveTo(rx, py + tileSize)
          g.lineTo(rx + 1.5, py + tileSize * 0.25)
          g.stroke({ width: 1.2, color: 0x2d4a28, alpha: 0.55 })
        }
        drawOrganicPatch(g, px + tileSize * 0.35, py + tileSize * 0.65, tileSize * 0.2, 0x1a3020, 0.35)
      }
      break
    }
    case 'marsh': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(adjustColor(baseColor, -8, 5, -5))
      g.rect(px, py, tileSize, tileSize)
      g.fill({ color: 0x3a5a40, alpha: 0.25 + tile.water * 0.2 })
      if (detail) {
        for (let i = 0; i < 3; i++) {
          const rx = px + hashRange(x, y, 185 + i, 0.1, 0.9) * tileSize
          g.moveTo(rx, py + tileSize * 0.85)
          g.quadraticCurveTo(rx + 2, py + tileSize * 0.5, rx, py + tileSize * 0.2)
          g.stroke({ width: 0.8, color: 0x6b8f5e, alpha: 0.5 })
        }
        g.ellipse(px + tileSize * 0.6, py + tileSize * 0.55, tileSize * 0.18, tileSize * 0.08)
        g.fill({ color: 0x7cfc00, alpha: 0.12 + tile.moisture * 0.1 })
      }
      break
    }
    case 'mountain': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      const peakX = px + tileSize * hashRange(x, y, 190, 0.3, 0.7)
      g.moveTo(peakX - tileSize * 0.35, py + tileSize)
      g.lineTo(peakX, py + tileSize * 0.12)
      g.lineTo(peakX + tileSize * 0.35, py + tileSize)
      g.fill({ color: adjustColor(baseColor, 15, 15, 20), alpha: 0.45 })
      if (tile.temperature < 0.32 || tile.elevation > 0.78) {
        g.moveTo(peakX - tileSize * 0.2, py + tileSize * 0.22)
        g.lineTo(peakX, py + tileSize * 0.12)
        g.lineTo(peakX + tileSize * 0.2, py + tileSize * 0.22)
        g.lineTo(peakX, py + tileSize * 0.35)
        g.fill({ color: 0xf0f8ff, alpha: 0.55 })
      }
      if (detail) {
        g.moveTo(px + tileSize * 0.15, py + tileSize * 0.65)
        g.lineTo(px + tileSize * 0.85, py + tileSize * 0.58)
        g.stroke({ width: 0.6, color: adjustColor(baseColor, -20, -18, -12), alpha: 0.35 })
        g.moveTo(px + tileSize * 0.4, py + tileSize * 0.75)
        g.lineTo(px + tileSize * 0.55, py + tileSize * 0.45)
        g.stroke({ width: 0.4, color: adjustColor(baseColor, -10, -10, -8), alpha: 0.3 })
      }
      break
    }
    case 'snow': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      for (let i = 0; i < (detail ? 4 : 2); i++) {
        const sx = px + hashRange(x, y, 205 + i, 0.05, 0.95) * tileSize
        const sy = py + hashRange(x, y, 215 + i, 0.05, 0.95) * tileSize
        g.circle(sx, sy, tileSize * hashRange(x, y, 225 + i, 0.03, 0.09))
        g.fill({ color: 0xffffff, alpha: 0.25 + hash01(x, y, 235 + i) * 0.2 })
      }
      if (detail && tile.elevation > 0.75) {
        g.moveTo(px + tileSize * 0.5, py + tileSize * 0.15)
        g.lineTo(px + tileSize * 0.35, py + tileSize * 0.35)
        g.lineTo(px + tileSize * 0.65, py + tileSize * 0.35)
        g.fill({ color: 0xe8f4ff, alpha: 0.4 })
      }
      break
    }
    case 'tundra': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      for (let i = 0; i < (detail ? 4 : 2); i++) {
        drawOrganicPatch(
          g,
          px + hashRange(x, y, 200 + i, 0.1, 0.9) * tileSize,
          py + hashRange(x, y, 210 + i, 0.1, 0.9) * tileSize,
          tileSize * 0.035,
          adjustColor(baseColor, -5, 0, 8),
          0.25,
        )
      }
      if (detail) {
        g.moveTo(px + tileSize * 0.2, py + tileSize * 0.7)
        g.lineTo(px + tileSize * 0.8, py + tileSize * 0.72)
        g.stroke({ width: 0.4, color: 0xa8b8c8, alpha: 0.35 })
      }
      break
    }
    case 'river': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      const flowDir = hash01(x, y, 220) > 0.5 ? 1 : -1
      const wave = shimmerOffset(animPhaseMs, x + y)
      for (let i = 0; i < 3; i++) {
        const fy = py + (i + 1) * tileSize * 0.25 + wave * 0.3
        g.moveTo(px, fy)
        g.bezierCurveTo(
          px + tileSize * 0.33, fy + flowDir * tileSize * 0.06,
          px + tileSize * 0.66, fy - flowDir * tileSize * 0.06,
          px + tileSize, fy,
        )
        g.stroke({ width: 1, color: adjustColor(baseColor, 20, 30, 15), alpha: 0.4 })
      }
      break
    }
    case 'volcanic': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
      if (detail) {
        for (let i = 0; i < 2; i++) {
          g.moveTo(px + hashRange(x, y, 230 + i, 0.2, 0.8) * tileSize, py + tileSize * 0.3)
          g.lineTo(px + hashRange(x, y, 240 + i, 0.3, 0.7) * tileSize, py + tileSize * 0.7)
          g.stroke({ width: 0.6, color: 0xff6b35, alpha: 0.35 + hash01(x, y, 250 + i) * 0.2 })
        }
      }
      drawOrganicPatch(g, px + tileSize * 0.5, py + tileSize * 0.5, tileSize * 0.15, 0xff4500, 0.15)
      break
    }
    case 'hydrothermal_vent': {
      g.rect(px, py, tileSize, tileSize)
      g.fill(adjustColor(baseColor, -10, -5, 10))
      const vx = px + tileSize * 0.5
      const vy = py + tileSize * 0.55
      g.circle(vx, vy, tileSize * 0.12)
      g.fill({ color: 0x2a1a4a, alpha: 0.8 })
      const plumeAlpha = pulseAlpha(animPhaseMs, 0.28, 0.12)
      for (let i = 0; i < 4; i++) {
        const ox = hashRange(x, y, 260 + i, -0.15, 0.15) * tileSize
        const sway = shimmerOffset(animPhaseMs, i) * 0.5
        g.moveTo(vx, vy)
        g.bezierCurveTo(
          vx + ox + sway, vy - tileSize * 0.15,
          vx + ox * 1.5 + sway, vy - tileSize * 0.35,
          vx + ox * 0.5 + sway, vy - tileSize * 0.5,
        )
        g.stroke({ width: 1.2, color: 0x7cfc00, alpha: plumeAlpha + i * 0.06 })
      }
      break
    }
    default: {
      g.rect(px, py, tileSize, tileSize)
      g.fill(baseColor)
    }
  }

  if (tile.elevation > 0.75 && terrain !== 'mountain' && terrain !== 'volcanic') {
    g.rect(px, py, tileSize, tileSize)
    g.fill({ color: 0xffffff, alpha: 0.04 * (tile.elevation - 0.75) * 4 })
  }
  if (tile.temperature < 0.25 && terrain === 'tundra') {
    g.rect(px, py, tileSize, tileSize)
    g.fill({ color: 0xe8f4ff, alpha: 0.08 })
  }
}

export function drawOrganicTile(
  g: Graphics,
  tile: Tile,
  tileSize: number,
  overlay: OverlayMode,
  context?: TileColorContext,
  animPhaseMs = 0,
  simTick = 0,
): void {
  const px = tile.x * tileSize
  const py = tile.y * tileSize

  if (tile.terrain === 'void') {
    drawVoidTile(g, px, py, tileSize)
    return
  }

  const baseColor = colorForTile(tile, overlay, context)

  g.rect(px, py, tileSize, tileSize)
  g.fill(baseColor)

  const tint = seasonTint(animPhaseMs, simTick)
  if (tint !== 0) {
    g.rect(px, py, tileSize, tileSize)
    g.fill({ color: tint > 0 ? 0xfff4e0 : 0xd0e8ff, alpha: Math.abs(tint) })
  }

  if (overlay === 'terrain' || overlay === 'life' || overlay === 'biomass') {
    drawBiomeTexture(g, tile, px, py, tileSize, baseColor, animPhaseMs)
  }
}

export function drawDebugTile(
  g: Graphics,
  tile: Tile,
  tileSize: number,
  overlay: OverlayMode,
  context?: TileColorContext,
): void {
  const px = tile.x * tileSize
  const py = tile.y * tileSize
  if (tile.terrain === 'void') {
    drawVoidTile(g, px, py, tileSize)
    return
  }
  g.rect(px, py, tileSize, tileSize)
  g.fill(colorForTile(tile, overlay, context))
}

export function terrainAccentColor(terrain: TerrainType): number {
  const accents: Record<TerrainType, number> = {
    deep_ocean: 0x0c2d48,
    ocean: 0x1a5276,
    coast: 0xc2b280,
    sand: 0xd4c4a0,
    rock: 0x8a8078,
    barren: 0xa89878,
    basin: 0x7a9088,
    fertile_plain: 0x9aab6a,
    grassland: 0x6aaf3d,
    forest: 0x2d6a4f,
    desert: 0xd4a574,
    mountain: 0x8b7355,
    river: 0x3498db,
    tundra: 0xc8d8e4,
    snow: 0xeef6ff,
    swamp: 0x3d5a3a,
    marsh: 0x4a6741,
    volcanic: 0x8b2500,
    hydrothermal_vent: 0x5c2d91,
    void: 0x050810,
  }
  return accents[terrain]
}

export function drawVoidTile(g: Graphics, px: number, py: number, tileSize: number): void {
  g.rect(px, py, tileSize, tileSize)
  g.fill(0x050810)
  g.circle(px + tileSize * 0.5, py + tileSize * 0.5, tileSize * 0.08)
  g.fill({ color: 0x1a2030, alpha: 0.35 })
}
