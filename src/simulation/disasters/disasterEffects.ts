import type { Tile, World } from '../../types/simulation'
import type { DisasterType } from './DisasterTypes'
import { forkRng, randomInt } from '../../utils/rng'
import { isTileActive } from '../world/planetMask'

export interface TileStress {
  waterDelta: number
  fertilityDelta: number
  temperatureDelta: number
  biomassBurn: number
  mortalityPressure: number
}

export interface DisasterRegion {
  centerX: number
  centerY: number
  radius: number
  affectedTileIds: number[]
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2)
}

function tilesMatching(
  world: World,
  predicate: (tile: Tile, idx: number) => boolean,
  limit = 800,
): number[] {
  const out: number[] = []
  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i]
    if (!isTileActive(world, tile.x, tile.y)) continue
    if (predicate(tile, i)) {
      out.push(i)
      if (out.length >= limit) break
    }
  }
  return out
}

export function selectDisasterRegion(
  world: World,
  seed: string,
  type: DisasterType,
  severityValue: number,
): DisasterRegion {
  const rng = forkRng(seed, `disaster-region-${type}`)
  const w = world.width
  const h = world.height

  let centerX = randomInt(rng, Math.floor(w * 0.2), Math.floor(w * 0.8))
  let centerY = randomInt(rng, Math.floor(h * 0.2), Math.floor(h * 0.8))
  const radius = Math.max(3, Math.round((8 + severityValue * 18) * (world.planetRadius / (w * 0.45))))

  // Bias center toward suitable terrain
  const biasAttempts = 12
  for (let a = 0; a < biasAttempts; a++) {
    const tx = randomInt(rng, 1, w - 2)
    const ty = randomInt(rng, 1, h - 2)
    const tile = world.tiles[tileIndex(tx, ty, w)]
    if (!isTileActive(world, tx, ty)) continue
    let score = 0
    switch (type) {
      case 'flood':
      case 'tsunami':
        if (tile.terrain === 'coast' || tile.terrain === 'river' || tile.elevation < 0.42) score = 2
        break
      case 'wildfire':
        if (tile.terrain === 'forest' || tile.terrain === 'grassland') score = 2
        break
      case 'volcanic_eruption':
      case 'earthquake':
        if (tile.terrain === 'volcanic' || tile.terrain === 'mountain') score = 2
        break
      case 'drought':
      case 'heat_wave':
        if (tile.terrain === 'desert' || tile.moisture < 0.35) score = 1.5
        break
      case 'ice_age_pulse':
        if (tile.terrain === 'tundra' || tile.terrain === 'snow') score = 2
        break
      case 'asteroid_impact':
        score = 1
        break
      default:
        score = 0.5
    }
    if (score > 0 && rng() < score * 0.4) {
      centerX = tx
      centerY = ty
      break
    }
  }

  const affectedTileIds: number[] = []
  for (const tile of world.tiles) {
    if (!isTileActive(world, tile.x, tile.y)) continue
    const d = dist(tile.x, tile.y, centerX, centerY)
    if (d <= radius) {
      affectedTileIds.push(tileIndex(tile.x, tile.y, w))
    }
  }

  // Global disasters expand to many tiles
  if (type === 'volcanic_winter' || type === 'ice_age_pulse' || type === 'oxygen_crash') {
    const global = tilesMatching(world, () => rng() < 0.15 + severityValue * 0.25, 1200)
    for (const id of global) {
      if (!affectedTileIds.includes(id)) affectedTileIds.push(id)
    }
  }

  if (type === 'flood') {
    const lowlands = tilesMatching(
      world,
      (t) => t.elevation < 0.45 || t.terrain === 'river' || t.terrain === 'coast' || t.terrain === 'marsh',
      600,
    )
    for (const id of lowlands) {
      if (rng() < 0.25 + severityValue * 0.35 && !affectedTileIds.includes(id)) {
        affectedTileIds.push(id)
      }
    }
  }

  return { centerX, centerY, radius, affectedTileIds }
}

export function tileStressForDisaster(
  type: DisasterType,
  severityValue: number,
  tile: Tile,
  distanceFromCenter: number,
  maxRadius: number,
): TileStress {
  const falloff = Math.max(0, 1 - distanceFromCenter / Math.max(1, maxRadius))
  const s = severityValue * falloff
  const zero: TileStress = {
    waterDelta: 0,
    fertilityDelta: 0,
    temperatureDelta: 0,
    biomassBurn: 0,
    mortalityPressure: 0,
  }

  switch (type) {
    case 'drought':
      return {
        waterDelta: -0.25 * s,
        fertilityDelta: -0.15 * s,
        temperatureDelta: 0.08 * s,
        biomassBurn: 0,
        mortalityPressure: 0.12 * s,
      }
    case 'flood':
      return {
        waterDelta: 0.35 * s,
        fertilityDelta: tile.elevation < 0.45 ? -0.2 * s : 0.05 * s,
        temperatureDelta: -0.03 * s,
        biomassBurn: 0,
        mortalityPressure: tile.elevation < 0.42 ? 0.2 * s : 0.05 * s,
      }
    case 'wildfire':
      return {
        waterDelta: -0.1 * s,
        fertilityDelta: -0.25 * s,
        temperatureDelta: 0.15 * s,
        biomassBurn: tile.terrain === 'forest' || tile.terrain === 'grassland' ? 0.6 * s : 0.2 * s,
        mortalityPressure: 0.35 * s,
      }
    case 'volcanic_eruption':
      return {
        waterDelta: -0.05 * s,
        fertilityDelta: -0.3 * s,
        temperatureDelta: 0.25 * s,
        biomassBurn: 0.5 * s,
        mortalityPressure: 0.5 * s,
      }
    case 'volcanic_winter':
      return {
        waterDelta: 0,
        fertilityDelta: -0.1 * s,
        temperatureDelta: -0.2 * s,
        biomassBurn: 0,
        mortalityPressure: 0.15 * s,
      }
    case 'ice_age_pulse':
      return {
        waterDelta: 0,
        fertilityDelta: -0.08 * s,
        temperatureDelta: -0.18 * s,
        biomassBurn: 0,
        mortalityPressure: 0.1 * s,
      }
    case 'heat_wave':
      return {
        waterDelta: -0.15 * s,
        fertilityDelta: -0.1 * s,
        temperatureDelta: 0.2 * s,
        biomassBurn: 0,
        mortalityPressure: tile.temperature > 0.55 ? 0.25 * s : 0.1 * s,
      }
    case 'storm':
      return {
        waterDelta: 0.2 * s,
        fertilityDelta: -0.05 * s,
        temperatureDelta: -0.05 * s,
        biomassBurn: 0,
        mortalityPressure: 0.08 * s,
      }
    case 'earthquake':
      return {
        waterDelta: 0,
        fertilityDelta: -0.15 * s,
        temperatureDelta: 0,
        biomassBurn: 0.1 * s,
        mortalityPressure: 0.2 * s,
      }
    case 'tsunami':
      return {
        waterDelta: 0.5 * s,
        fertilityDelta: -0.2 * s,
        temperatureDelta: -0.02 * s,
        biomassBurn: 0.15 * s,
        mortalityPressure:
          tile.terrain === 'coast' || tile.elevation < 0.43 ? 0.45 * s : 0.05 * s,
      }
    case 'asteroid_impact':
      return {
        waterDelta: -0.05 * s,
        fertilityDelta: -0.4 * s,
        temperatureDelta: falloff > 0.7 ? 0.3 * s : -0.15 * s,
        biomassBurn: 0.8 * s,
        mortalityPressure: 0.7 * s,
      }
    case 'disease_outbreak':
      return {
        waterDelta: 0,
        fertilityDelta: 0,
        temperatureDelta: 0,
        biomassBurn: 0,
        mortalityPressure: 0.3 * s,
      }
    case 'oxygen_crash':
      return {
        waterDelta: 0,
        fertilityDelta: -0.12 * s,
        temperatureDelta: 0,
        biomassBurn: 0,
        mortalityPressure: 0.2 * s,
      }
    default:
      return zero
  }
}

export function applyTileStress(tile: Tile, stress: TileStress): void {
  tile.water = Math.max(0, Math.min(1, tile.water + stress.waterDelta))
  tile.soilFertility = Math.max(0, Math.min(1, tile.soilFertility + stress.fertilityDelta))
  tile.temperature = Math.max(0, Math.min(1, tile.temperature + stress.temperatureDelta))
  if (stress.temperatureDelta < -0.08 && tile.terrain === 'grassland' && tile.temperature < 0.28) {
    tile.terrain = 'tundra'
  }
  if (stress.temperatureDelta < -0.12 && tile.elevation > 0.7 && tile.temperature < 0.25) {
    tile.terrain = 'snow'
  }
  if (stress.waterDelta > 0.2 && tile.elevation < 0.45 && tile.moisture > 0.55) {
    if (tile.terrain === 'grassland' || tile.terrain === 'coast') tile.terrain = 'marsh'
  }
}

export function disasterEffectSummary(type: DisasterType, severityValue: number, count: number): string {
  const label = type.replace(/_/g, ' ')
  return `${label} (${Math.round(severityValue * 100)}% severity) affecting ${count} tiles`
}
