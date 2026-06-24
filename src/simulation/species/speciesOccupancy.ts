import type { LifeKind, LifeOrganism, SpeciesOccupancy, SpeciesRecord } from '../../types/life'
import type { TerrainType, World } from '../../types/simulation'

export function buildSpeciesOccupancy(
  organisms: LifeOrganism[],
  species: SpeciesRecord[],
  world: World,
): Record<string, SpeciesOccupancy> {
  const bySpecies = new Map<
    string,
    {
      tileSet: Set<number>
      generationSum: number
      energySum: number
      healthSum: number
      terrainCounts: Map<TerrainType, number>
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
    result[record.id] = {
      speciesId: record.id,
      tileIndices: [...entry.tileSet],
      occupiedTileCount: entry.tileSet.size,
      avgGeneration: pop > 0 ? entry.generationSum / pop : 0,
      avgEnergy: pop > 0 ? entry.energySum / pop : 0,
      avgHealth: pop > 0 ? entry.healthSum / pop : 0,
      dominantTerrain,
    }
  }

  return result
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

export function kindLabel(kind: LifeKind): string {
  return kind.replace(/([A-Z])/g, ' $1').trim()
}
