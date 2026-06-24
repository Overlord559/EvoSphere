import type { SimulationSettings, TerrainType, Tile, World } from '../../types/simulation'
import { forkRng, randomInt } from '../../utils/rng'
import { nanoid } from 'nanoid'
import {
  buildNoiseLattice,
  fractalNoise,
  jitteredNoise,
} from './noise'
import {
  applyPlanetEdgeClimate,
  buildActiveMask,
  computePlanetGeometry,
  isTileActiveOnPlanet,
  markVoidTile,
} from './planetMask'
import { buildOriginProfile } from './originProfiles'

const SEA_LEVEL = 0.38
const DEEP_OCEAN_LEVEL = 0.22
const MOUNTAIN_LEVEL = 0.72
const COAST_BAND = 0.045

function latitudeFromY(y: number, height: number): number {
  return Math.abs(y / Math.max(height - 1, 1) - 0.5) * 2
}

function computeTemperature(
  elevation: number,
  latitude: number,
  variation: number,
): number {
  const equatorHeat = 1 - latitude * 0.55
  const lapse = elevation * 0.45
  return Math.max(0, Math.min(1, equatorHeat - lapse + (variation - 0.5) * 0.12))
}

function computeWater(elevation: number, moisture: number, terrain: TerrainType): number {
  if (terrain === 'deep_ocean' || terrain === 'ocean') return 1
  if (terrain === 'river') return 0.85
  if (terrain === 'coast') return 0.55 + moisture * 0.2
  if (terrain === 'basin') return 0.65 + moisture * 0.25
  if (elevation < SEA_LEVEL) return 0.9
  return moisture * (1 - elevation) * 0.35
}

function computeSoilFertility(
  terrain: TerrainType,
  moisture: number,
  temperature: number,
  elevation: number,
): number {
  if (terrain === 'deep_ocean' || terrain === 'ocean' || terrain === 'hydrothermal_vent') {
    return 0.05
  }
  if (terrain === 'desert' || terrain === 'mountain' || terrain === 'volcanic' || terrain === 'snow') {
    return 0.15
  }
  if (terrain === 'river' || terrain === 'basin' || terrain === 'coast') {
    return 0.55 + moisture * 0.25
  }
  const tempFactor = 1 - Math.abs(temperature - 0.55) * 1.2
  const moistFactor = moisture * 0.7
  const elevFactor = elevation > MOUNTAIN_LEVEL ? 0.2 : 0.5
  return Math.max(0, Math.min(1, tempFactor * 0.4 + moistFactor * 0.35 + elevFactor * 0.25))
}

function computeResourceDeposits(
  terrain: TerrainType,
  elevation: number,
  variation: number,
): number {
  if (terrain === 'mountain' || terrain === 'volcanic') {
    return 0.35 + elevation * 0.4 + variation * 0.2
  }
  if (terrain === 'hydrothermal_vent') return 0.5 + variation * 0.3
  if (terrain === 'deep_ocean') return 0.1 + variation * 0.15
  return variation * 0.25
}

function classifyLandTerrain(
  elevation: number,
  moisture: number,
  temperature: number,
): TerrainType {
  if (elevation >= MOUNTAIN_LEVEL) {
    if (temperature < 0.28) return 'snow'
    return 'mountain'
  }
  if (temperature < 0.2) return 'tundra'
  if (temperature < 0.32 && elevation > 0.55) return 'snow'
  if (moisture < 0.18 && temperature > 0.42) return 'desert'
  // Wet lowlands — abiotic basin (marsh/swamp emerge via succession)
  if (moisture > 0.72 && elevation < SEA_LEVEL + 0.12) return 'basin'
  if (moisture > 0.55 && elevation < SEA_LEVEL + 0.18) return 'basin'
  // Rocky / sandy barren — fertile plains for pioneer life
  if (moisture < 0.28 && elevation > 0.5) return 'rock'
  if (moisture < 0.22) return 'sand'
  if (moisture > 0.38 && temperature > 0.4) return 'fertile_plain'
  return 'barren'
}

function classifyAquaticTerrain(elevation: number): TerrainType {
  if (elevation < DEEP_OCEAN_LEVEL) return 'deep_ocean'
  return 'ocean'
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x
}

function getElevationGrid(
  settings: SimulationSettings,
): number[][] {
  const { seed, worldWidth, worldHeight } = settings
  const elevRng = forkRng(seed, 'elevation')
  const lattices = [
    buildNoiseLattice(forkRng(seed, 'elev-o1'), 8, 8),
    buildNoiseLattice(forkRng(seed, 'elev-o2'), 16, 16),
    buildNoiseLattice(forkRng(seed, 'elev-o3'), 32, 32),
    buildNoiseLattice(forkRng(seed, 'elev-o4'), 64, 64),
  ]

  const grid: number[][] = []
  for (let y = 0; y < worldHeight; y++) {
    grid[y] = []
    for (let x = 0; x < worldWidth; x++) {
      const base = fractalNoise(lattices, x, y, worldWidth, worldHeight)
      const detail = jitteredNoise(elevRng, 0, 0.04)
      grid[y][x] = Math.max(0, Math.min(1, base * 0.92 + detail * 0.08))
    }
  }
  return grid
}

/** Enhance elevation along deterministic ridge lines for visible mountain ranges. */
function applyMountainRidges(
  elevationGrid: number[][],
  settings: SimulationSettings,
): void {
  const { seed, worldWidth, worldHeight } = settings
  const ridgeRng = forkRng(seed, 'mountain-ridges')
  const ridgeCount = Math.max(2, Math.floor(worldWidth / 48))

  for (let r = 0; r < ridgeCount; r++) {
    const angle = ridgeRng() * Math.PI
    const cx = ridgeRng() * worldWidth
    const cy = ridgeRng() * worldHeight
    const spread = 2 + ridgeRng() * 4

    for (let y = 0; y < worldHeight; y++) {
      for (let x = 0; x < worldWidth; x++) {
        const dx = x - cx
        const dy = y - cy
        const along = dx * Math.cos(angle) + dy * Math.sin(angle)
        const across = -dx * Math.sin(angle) + dy * Math.cos(angle)
        const ridgeFactor = Math.exp(-(across * across) / (spread * spread))
        if (Math.abs(along) < worldWidth * 0.45) {
          elevationGrid[y][x] = Math.min(
            1,
            elevationGrid[y][x] + ridgeFactor * (0.08 + ridgeRng() * 0.06),
          )
        }
      }
    }
  }
}

function getMoistureGrid(settings: SimulationSettings): number[][] {
  const { seed, worldWidth, worldHeight } = settings
  const moistRng = forkRng(seed, 'moisture')
  const lattices = [
    buildNoiseLattice(forkRng(seed, 'moist-o1'), 8, 8),
    buildNoiseLattice(forkRng(seed, 'moist-o2'), 16, 16),
    buildNoiseLattice(forkRng(seed, 'moist-o3'), 32, 32),
  ]

  const grid: number[][] = []
  for (let y = 0; y < worldHeight; y++) {
    grid[y] = []
    for (let x = 0; x < worldWidth; x++) {
      const base = fractalNoise(lattices, x, y, worldWidth, worldHeight)
      grid[y][x] = jitteredNoise(moistRng, base, 0.06)
    }
  }
  return grid
}

function carveRivers(
  elevationGrid: number[][],
  moistureGrid: number[][],
  terrainGrid: TerrainType[][],
  settings: SimulationSettings,
  geometry: ReturnType<typeof computePlanetGeometry>,
): void {
  const { seed, worldWidth, worldHeight } = settings
  const riverRng = forkRng(seed, 'rivers')
  const riverCount = Math.max(2, Math.floor((worldWidth * worldHeight) / 2500))

  for (let r = 0; r < riverCount; r++) {
    let x = randomInt(riverRng, 1, worldWidth - 2)
    let y = randomInt(riverRng, 1, worldHeight - 2)

    let bestScore = -1
    for (let attempt = 0; attempt < 24; attempt++) {
      const tx = randomInt(riverRng, 2, worldWidth - 3)
      const ty = randomInt(riverRng, 2, worldHeight - 3)
      const score = elevationGrid[ty][tx] * moistureGrid[ty][tx]
      if (score > bestScore && elevationGrid[ty][tx] > SEA_LEVEL + 0.08) {
        bestScore = score
        x = tx
        y = ty
      }
    }

    for (let step = 0; step < worldWidth + worldHeight; step++) {
      if (!isTileActiveOnPlanet(x, y, geometry)) break
      const terrain = terrainGrid[y][x]
      if (terrain === 'ocean' || terrain === 'deep_ocean' || terrain === 'coast') break
      if (elevationGrid[y][x] > SEA_LEVEL && moistureGrid[y][x] > 0.35) {
        terrainGrid[y][x] = 'river'
      }

      let nextX = x
      let nextY = y
      let lowest = elevationGrid[y][x]
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= worldWidth || ny >= worldHeight) continue
        if (elevationGrid[ny][nx] < lowest) {
          lowest = elevationGrid[ny][nx]
          nextX = nx
          nextY = ny
        }
      }
      if (nextX === x && nextY === y) break
      x = nextX
      y = nextY
    }
  }
}

function applyVolcanicFeatures(
  elevationGrid: number[][],
  terrainGrid: TerrainType[][],
  settings: SimulationSettings,
  geometry: ReturnType<typeof computePlanetGeometry>,
): void {
  const { seed, worldWidth, worldHeight } = settings
  const volcRng = forkRng(seed, 'volcanic')
  const ventRng = forkRng(seed, 'hydrothermal')

  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      if (!isTileActiveOnPlanet(x, y, geometry)) continue
      const terrain = terrainGrid[y][x]
      const elev = elevationGrid[y][x]

      if (terrain === 'mountain' && volcRng() < 0.018) {
        terrainGrid[y][x] = 'volcanic'
      } else if (terrain === 'deep_ocean' && elev < DEEP_OCEAN_LEVEL + 0.04 && ventRng() < 0.012) {
        terrainGrid[y][x] = 'hydrothermal_vent'
      }
    }
  }
}

function buildTerrainGrid(
  elevationGrid: number[][],
  moistureGrid: number[][],
  settings: SimulationSettings,
  geometry: ReturnType<typeof computePlanetGeometry>,
): TerrainType[][] {
  const { worldWidth, worldHeight } = settings
  const tempRng = forkRng(settings.seed, 'temperature')
  const terrainGrid: TerrainType[][] = []

  for (let y = 0; y < worldHeight; y++) {
    terrainGrid[y] = []
    const latitude = latitudeFromY(y, worldHeight)
    for (let x = 0; x < worldWidth; x++) {
      if (!isTileActiveOnPlanet(x, y, geometry)) {
        terrainGrid[y][x] = 'void'
        continue
      }
      const elevation = elevationGrid[y][x]
      const moisture = moistureGrid[y][x]
      const tempVar = tempRng()

      if (elevation < SEA_LEVEL - COAST_BAND) {
        terrainGrid[y][x] = classifyAquaticTerrain(elevation)
      } else if (elevation < SEA_LEVEL + COAST_BAND) {
        terrainGrid[y][x] = 'coast'
      } else {
        const temperature = computeTemperature(elevation, latitude, tempVar)
        terrainGrid[y][x] = classifyLandTerrain(elevation, moisture, temperature)
      }
    }
  }

  carveRivers(elevationGrid, moistureGrid, terrainGrid, settings, geometry)
  applyVolcanicFeatures(elevationGrid, terrainGrid, settings, geometry)
  return terrainGrid
}

function gridToTiles(
  elevationGrid: number[][],
  moistureGrid: number[][],
  terrainGrid: TerrainType[][],
  settings: SimulationSettings,
  geometry: ReturnType<typeof computePlanetGeometry>,
): Tile[] {
  const { worldWidth, worldHeight, seed } = settings
  const tempRng = forkRng(seed, 'temperature-tiles')
  const resourceRng = forkRng(seed, 'resources')
  const tiles: Tile[] = []

  for (let y = 0; y < worldHeight; y++) {
    const latitude = latitudeFromY(y, worldHeight)
    for (let x = 0; x < worldWidth; x++) {
      const terrain = terrainGrid[y][x]
      if (terrain === 'void' || !isTileActiveOnPlanet(x, y, geometry)) {
        tiles.push({
          x,
          y,
          terrain: 'void',
          ecosystem: 'none',
          successionStage: 'none',
          successionStability: 0,
          disturbanceLevel: 0,
          elevation: 0,
          moisture: 0,
          temperature: 0,
          water: 0,
          soilFertility: 0,
          resourceDeposits: 0,
        })
        continue
      }

      const elevation = elevationGrid[y][x]
      const moisture = moistureGrid[y][x]
      const temperature = computeTemperature(elevation, latitude, tempRng())
      const water = computeWater(elevation, moisture, terrain)
      const soilFertility = computeSoilFertility(terrain, moisture, temperature, elevation)
      const resourceDeposits = computeResourceDeposits(terrain, elevation, resourceRng())

      const tile: Tile = {
        x,
        y,
        terrain,
        ecosystem: 'none',
        successionStage: 'none',
        successionStability: 0,
        disturbanceLevel: 0,
        elevation,
        moisture,
        temperature,
        water,
        soilFertility,
        resourceDeposits,
      }
      applyPlanetEdgeClimate(tile, geometry)
      tiles.push(tile)
    }
  }

  return tiles
}

/** Deterministic procedural world from seed and settings. */
export function generateWorld(settings: SimulationSettings): World {
  const geometry = computePlanetGeometry(settings)
  const elevationGrid = getElevationGrid(settings)
  applyMountainRidges(elevationGrid, settings)
  const moistureGrid = getMoistureGrid(settings)
  const terrainGrid = buildTerrainGrid(elevationGrid, moistureGrid, settings, geometry)
  const tiles = gridToTiles(elevationGrid, moistureGrid, terrainGrid, settings, geometry)
  const activeMask = buildActiveMask(settings, geometry)

  for (let i = 0; i < tiles.length; i++) {
    if (!activeMask[i]) markVoidTile(tiles[i])
  }

  const draftWorld: World = {
    id: nanoid(),
    seed: settings.seed,
    width: settings.worldWidth,
    height: settings.worldHeight,
    tiles,
    tick: 0,
    planetCenterX: geometry.centerX,
    planetCenterY: geometry.centerY,
    planetRadius: geometry.radius,
    activeMask,
    originProfile: {
      originProfileName: 'pending',
      founderTileIds: [],
      originBiomeTypes: [],
      originEnergySources: [],
      explanation: '',
      founderSites: [],
    },
  }

  const originProfile = buildOriginProfile(settings, draftWorld)
  draftWorld.originProfile = {
    originProfileName: originProfile.originProfileName,
    founderTileIds: originProfile.founderTileIds,
    originBiomeTypes: originProfile.originBiomeTypes,
    originEnergySources: originProfile.originEnergySources,
    explanation: originProfile.explanation,
    founderSites: originProfile.sites.map((s) => ({
      tileIndex: s.tileIndex,
      x: s.x,
      y: s.y,
      lifeKind: s.lifeKind,
      energySource: s.energySource,
    })),
  }

  return draftWorld
}

export function getTileAt(world: World, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined
  const tile = world.tiles[tileIndex(x, y, world.width)]
  if (!tile || tile.terrain === 'void' || !world.activeMask[tileIndex(x, y, world.width)]) {
    return undefined
  }
  return tile
}

/** Returns tile even on void/inactive cells (for inspector). */
export function getTileAtRaw(world: World, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined
  return world.tiles[tileIndex(x, y, world.width)]
}

export { SEA_LEVEL, DEEP_OCEAN_LEVEL, MOUNTAIN_LEVEL }
