import type { SimulationSettings, Tile, World } from '../../types/simulation'

/** Fraction of half-grid used as active planet radius (inside square bounds). */
export const PLANET_RADIUS_FACTOR = 0.92

export interface PlanetGeometry {
  centerX: number
  centerY: number
  radius: number
}

export function computePlanetGeometry(settings: SimulationSettings): PlanetGeometry {
  const centerX = (settings.worldWidth - 1) / 2
  const centerY = (settings.worldHeight - 1) / 2
  const radius = (Math.min(settings.worldWidth, settings.worldHeight) / 2) * PLANET_RADIUS_FACTOR
  return { centerX, centerY, radius }
}

export function tileDistanceFromCenter(
  x: number,
  y: number,
  geometry: PlanetGeometry,
): number {
  const dx = x - geometry.centerX
  const dy = y - geometry.centerY
  return Math.sqrt(dx * dx + dy * dy)
}

/** Normalized distance from center: 0 at core, 1 at planet edge. */
export function normalizedPlanetDistance(
  x: number,
  y: number,
  geometry: PlanetGeometry,
): number {
  if (geometry.radius <= 0) return 1
  return tileDistanceFromCenter(x, y, geometry) / geometry.radius
}

export function isTileActiveOnPlanet(
  x: number,
  y: number,
  geometry: PlanetGeometry,
): boolean {
  return tileDistanceFromCenter(x, y, geometry) <= geometry.radius
}

export function buildActiveMask(
  settings: SimulationSettings,
  geometry: PlanetGeometry,
): boolean[] {
  const size = settings.worldWidth * settings.worldHeight
  const mask = new Array<boolean>(size)
  for (let y = 0; y < settings.worldHeight; y++) {
    for (let x = 0; x < settings.worldWidth; x++) {
      mask[y * settings.worldWidth + x] = isTileActiveOnPlanet(x, y, geometry)
    }
  }
  return mask
}

export function isTileActive(world: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false
  const idx = y * world.width + x
  return world.activeMask[idx] ?? false
}

export function isTileActiveIndex(world: World, idx: number): boolean {
  return world.activeMask[idx] ?? false
}

/** Edge falloff 0..1 — higher near rim (ocean bias). */
export function planetEdgeFalloff(x: number, y: number, geometry: PlanetGeometry): number {
  const norm = normalizedPlanetDistance(x, y, geometry)
  if (norm <= 0.72) return 0
  return Math.min(1, (norm - 0.72) / 0.28)
}

export function applyPlanetEdgeClimate(tile: Tile, geometry: PlanetGeometry): void {
  const falloff = planetEdgeFalloff(tile.x, tile.y, geometry)
  if (falloff <= 0) return
  tile.elevation = Math.max(0, tile.elevation - falloff * 0.08)
  tile.moisture = Math.min(1, tile.moisture + falloff * 0.12)
  if (falloff > 0.55 && tile.terrain !== 'mountain' && tile.terrain !== 'volcanic') {
    if (tile.elevation < 0.42) tile.terrain = 'ocean'
    else if (tile.terrain === 'grassland' || tile.terrain === 'forest') tile.terrain = 'coast'
  }
}

export function markVoidTile(tile: Tile): void {
  tile.terrain = 'void'
  tile.elevation = 0
  tile.moisture = 0
  tile.temperature = 0
  tile.water = 0
  tile.soilFertility = 0
  tile.resourceDeposits = 0
}
