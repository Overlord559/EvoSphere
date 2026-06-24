export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'desert'
  | 'tundra'
  | 'swamp'

export interface Tile {
  x: number
  y: number
  terrain: TerrainType
  elevation: number
  moisture: number
  temperature: number
}

export interface World {
  id: string
  seed: string
  width: number
  height: number
  tiles: Tile[]
  tick: number
}

export interface SimulationSettings {
  seed: string
  worldWidth: number
  worldHeight: number
  tickRate: number
}

export interface SimulationSnapshot {
  tick: number
  worldId: string
  populationCount: number
  eventCount: number
}

export interface EventLogEntry {
  id: string
  tick: number
  type: string
  message: string
  timestamp: number
}
