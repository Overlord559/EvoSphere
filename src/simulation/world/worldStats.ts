import type { TerrainType, Tile, World, WorldStats } from '../../types/simulation'

const WATER_TERRAINS = new Set<TerrainType>([
  'deep_ocean',
  'ocean',
  'coast',
  'river',
  'hydrothermal_vent',
])

export function computeWorldStats(world: World): WorldStats {
  const terrainDistribution: Partial<Record<TerrainType, number>> = {}
  let temperatureSum = 0
  let moistureSum = 0
  let waterTileCount = 0

  for (const tile of world.tiles) {
    terrainDistribution[tile.terrain] = (terrainDistribution[tile.terrain] ?? 0) + 1
    temperatureSum += tile.temperature
    moistureSum += tile.moisture
    if (WATER_TERRAINS.has(tile.terrain) || tile.water >= 0.5) {
      waterTileCount += 1
    }
  }

  const tileCount = world.tiles.length
  return {
    tileCount,
    terrainDistribution,
    averageTemperature: tileCount > 0 ? temperatureSum / tileCount : 0,
    averageMoisture: tileCount > 0 ? moistureSum / tileCount : 0,
    waterCoveragePercent: tileCount > 0 ? (waterTileCount / tileCount) * 100 : 0,
  }
}

export function formatTemperature(value: number): string {
  const celsius = -40 + value * 80
  return `${celsius.toFixed(1)}°C`
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function sortTerrainDistribution(
  distribution: Partial<Record<TerrainType, number>>,
): Array<[TerrainType, number]> {
  return Object.entries(distribution)
    .map(([terrain, count]) => [terrain as TerrainType, count ?? 0] as [TerrainType, number])
    .sort((a, b) => b[1] - a[1])
}

export function isWaterTile(tile: Tile): boolean {
  return WATER_TERRAINS.has(tile.terrain) || tile.water >= 0.5
}
