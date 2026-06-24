import type { OverlayMode, Tile, TerrainType } from '../../types/simulation'

const TERRAIN_COLORS: Record<TerrainType, number> = {
  deep_ocean: 0x0c2d48,
  ocean: 0x1a5276,
  coast: 0xc2b280,
  grassland: 0x6aaf3d,
  forest: 0x2d6a4f,
  desert: 0xd4a574,
  mountain: 0x8b7355,
  river: 0x3498db,
  tundra: 0xb8c5d0,
  swamp: 0x4a6741,
  volcanic: 0x8b2500,
  hydrothermal_vent: 0x5c2d91,
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function gradientColor(stops: [number, number, number][], t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  const idx = clamped * (stops.length - 1)
  const i0 = Math.floor(idx)
  const i1 = Math.min(i0 + 1, stops.length - 1)
  const frac = idx - i0
  const [r0, g0, b0] = stops[i0]
  const [r1, g1, b1] = stops[i1]
  const r = lerpChannel(r0, r1, frac)
  const g = lerpChannel(g0, g1, frac)
  const b = lerpChannel(b0, b1, frac)
  return (r << 16) | (g << 8) | b
}

export function colorForTerrain(terrain: TerrainType): number {
  return TERRAIN_COLORS[terrain]
}

export function colorForTile(tile: Tile, overlay: OverlayMode): number {
  switch (overlay) {
    case 'terrain':
      return colorForTerrain(tile.terrain)
    case 'elevation':
      return gradientColor(
        [
          [12, 45, 72],
          [26, 82, 118],
          [106, 175, 61],
          [139, 115, 85],
          [240, 240, 245],
        ],
        tile.elevation,
      )
    case 'moisture':
      return gradientColor(
        [
          [194, 178, 128],
          [106, 175, 61],
          [52, 106, 79],
          [26, 82, 118],
        ],
        tile.moisture,
      )
    case 'temperature':
      return gradientColor(
        [
          [180, 210, 230],
          [106, 175, 61],
          [212, 160, 90],
          [180, 40, 30],
        ],
        tile.temperature,
      )
    case 'water':
      return gradientColor(
        [
          [194, 178, 128],
          [52, 152, 219],
          [12, 45, 72],
        ],
        tile.water,
      )
    case 'fertility':
      return gradientColor(
        [
          [120, 100, 80],
          [180, 160, 90],
          [106, 175, 61],
          [45, 106, 79],
        ],
        tile.soilFertility,
      )
  }
}

export const OVERLAY_MODES: { id: OverlayMode; label: string }[] = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'moisture', label: 'Moisture' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'water', label: 'Water' },
  { id: 'fertility', label: 'Fertility' },
]

export function terrainLabel(terrain: TerrainType): string {
  return terrain.replace(/_/g, ' ')
}
