import type { MobileAgent } from '../../types/agents'
import type { LifeKind, LifeOrganism, SpeciesOccupancy, SpeciesRecord } from '../../types/life'
import type { TerrainType, World } from '../../types/simulation'
import type { PopulationUnit } from '../ecology/populationUnits'

/** Max tile indices per species in snapshot — prevents unbounded JSON growth. */
export const MAX_OCCUPANCY_TILE_INDICES = 64

export function buildSpeciesOccupancy(
  organisms: LifeOrganism[],
  species: SpeciesRecord[],
  world: World,
  agents: MobileAgent[] = [],
  populationUnits: PopulationUnit[] = [],
): Record<string, SpeciesOccupancy> {
  const bySpecies = new Map<
    string,
    {
      tileSet: Set<number>
      generationSum: number
      energySum: number
      healthSum: number
      terrainCounts: Map<TerrainType, number>
      unitCount: number
      cohortIndividuals: number
    }
  >()

  for (const organism of organisms) {
    const idx = organism.y * world.width + organism.x
    let entry = bySpecies.get(organism.speciesId)
    if (!entry) {
      entry = {
        tileSet: new Set(),
        generationSum: 0,
        energySum: 0,
        healthSum: 0,
        terrainCounts: new Map(),
        unitCount: 0,
        cohortIndividuals: 0,
      }
      bySpecies.set(organism.speciesId, entry)
    }
    entry.tileSet.add(idx)
    entry.generationSum += organism.generation
    entry.energySum += organism.energy
    entry.healthSum += organism.health

    const tile = world.tiles[idx]
    if (tile) {
      entry.terrainCounts.set(tile.terrain, (entry.terrainCounts.get(tile.terrain) ?? 0) + 1)
    }
  }

  for (const agent of agents) {
    const idx = agent.y * world.width + agent.x
    let entry = bySpecies.get(agent.speciesId)
    if (!entry) {
      entry = {
        tileSet: new Set(),
        generationSum: 0,
        energySum: 0,
        healthSum: 0,
        terrainCounts: new Map(),
        unitCount: 0,
        cohortIndividuals: 0,
      }
      bySpecies.set(agent.speciesId, entry)
    }
    entry.tileSet.add(idx)
    entry.generationSum += agent.generation
    entry.energySum += agent.energy
    entry.healthSum += agent.health

    const tile = world.tiles[idx]
    if (tile) {
      entry.terrainCounts.set(tile.terrain, (entry.terrainCounts.get(tile.terrain) ?? 0) + 1)
    }
  }

  for (const unit of populationUnits) {
    let entry = bySpecies.get(unit.speciesId)
    if (!entry) {
      entry = {
        tileSet: new Set(),
        generationSum: 0,
        energySum: 0,
        healthSum: 0,
        terrainCounts: new Map(),
        unitCount: 0,
        cohortIndividuals: 0,
      }
      bySpecies.set(unit.speciesId, entry)
    }
    entry.tileSet.add(unit.tileIndex)
    entry.unitCount += 1
    entry.cohortIndividuals += unit.representedIndividuals
    entry.generationSum += unit.averageGeneration * unit.representedIndividuals
    entry.energySum += unit.averageEnergy * unit.representedIndividuals
    entry.healthSum += unit.health * unit.representedIndividuals

    const tile = world.tiles[unit.tileIndex]
    if (tile) {
      entry.terrainCounts.set(
        tile.terrain,
        (entry.terrainCounts.get(tile.terrain) ?? 0) + unit.representedIndividuals,
      )
    }
  }

  const result: Record<string, SpeciesOccupancy> = {}
  for (const record of species) {
    const entry = bySpecies.get(record.id)
    if (!entry || record.population <= 0) continue

    let dominantTerrain: TerrainType | null = null
    let dominantCount = 0
    for (const [terrain, count] of entry.terrainCounts) {
      if (count > dominantCount) {
        dominantCount = count
        dominantTerrain = terrain
      }
    }

    const pop = record.population
    const sortedTiles = [...entry.tileSet].sort((a, b) => a - b)
    const tileIndices = sortedTiles.slice(0, MAX_OCCUPANCY_TILE_INDICES)

    result[record.id] = {
      speciesId: record.id,
      tileIndices,
      occupiedTileCount: entry.tileSet.size,
      avgGeneration: pop > 0 ? entry.generationSum / pop : 0,
      avgEnergy: pop > 0 ? entry.energySum / pop : 0,
      avgHealth: pop > 0 ? entry.healthSum / pop : 0,
      dominantTerrain,
      unitCount: entry.unitCount,
      estimatedPopulation: pop,
    }
  }

  return result
}

export function buildCompactSpeciesOccupancy(
  occupancy: Record<string, SpeciesOccupancy>,
): Record<string, Omit<SpeciesOccupancy, 'tileIndices'> & { tileIndices: number[] }> {
  const compact: Record<string, SpeciesOccupancy> = {}
  for (const [id, occ] of Object.entries(occupancy)) {
    compact[id] = {
      ...occ,
      tileIndices: occ.tileIndices.slice(0, MAX_OCCUPANCY_TILE_INDICES),
    }
  }
  return compact
}

export function threatStatus(
  species: SpeciesRecord,
  popHistory: number | undefined,
): 'stable' | 'growing' | 'threatened' | 'extinct' {
  if (species.population <= 0) return 'extinct'
  const prev = popHistory ?? species.population
  const delta = species.population - prev
  if (species.population < 8 || delta <= -3) return 'threatened'
  if (delta >= 5) return 'growing'
  return 'stable'
}

export function kindLabel(kind: LifeKind | import('../../types/agents').AgentKind): string {
  return kind.replace(/([A-Z])/g, ' $1').trim()
}
