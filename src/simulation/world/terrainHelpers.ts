import type { EcosystemType, SuccessionStage, TerrainType, Tile } from '../../types/simulation'

/** Biotic ecosystems that emerge from succession — never set at worldgen. */
export const BIOTIC_ECOSYSTEMS = new Set<EcosystemType>([
  'microbial_mat',
  'algae_bloom',
  'kelp_coast',
  'moss_field',
  'grassland',
  'forest',
  'swamp',
  'marsh',
  'fungal_zone',
  'reef',
])

/** Abiotic substrates allowed at world birth. */
export const ABIOTIC_TERRAINS = new Set<TerrainType>([
  'deep_ocean',
  'ocean',
  'coast',
  'sand',
  'rock',
  'barren',
  'basin',
  'fertile_plain',
  'desert',
  'mountain',
  'river',
  'tundra',
  'snow',
  'volcanic',
  'hydrothermal_vent',
  'void',
])

/** Legacy biotic terrain names — only valid via ecosystem overlay. */
export const LEGACY_BIOTIC_TERRAINS = new Set<TerrainType>([
  'grassland',
  'forest',
  'swamp',
  'marsh',
])

export function isAbioticTerrain(terrain: TerrainType): boolean {
  return ABIOTIC_TERRAINS.has(terrain) || terrain === 'void'
}

export function hasBioticOverlay(tile: Tile): boolean {
  return tile.ecosystem !== 'none'
}

/** Habitat classification for ecology — prefers life-created ecosystem. */
export function effectiveHabitatTerrain(tile: Tile): TerrainType {
  if (tile.ecosystem === 'grassland') return 'grassland'
  if (tile.ecosystem === 'forest') return 'forest'
  if (tile.ecosystem === 'swamp') return 'swamp'
  if (tile.ecosystem === 'marsh') return 'marsh'
  if (tile.ecosystem === 'algae_bloom' || tile.ecosystem === 'kelp_coast' || tile.ecosystem === 'reef') {
    return tile.terrain === 'coast' ? 'coast' : 'ocean'
  }
  if (tile.ecosystem === 'microbial_mat') {
    return tile.water > 0.5 ? 'coast' : 'barren'
  }
  if (tile.ecosystem === 'moss_field') return 'fertile_plain'
  return tile.terrain
}

export function ecosystemToSuccession(eco: EcosystemType): SuccessionStage {
  switch (eco) {
    case 'microbial_mat':
      return 'microbial'
    case 'algae_bloom':
    case 'kelp_coast':
    case 'reef':
      return 'algal'
    case 'moss_field':
      return 'pioneer_plants'
    case 'grassland':
      return 'grassland'
    case 'forest':
      return 'forest'
    case 'swamp':
      return 'swamp'
    case 'marsh':
      return 'marsh'
    case 'fungal_zone':
      return 'mature'
    default:
      return 'none'
  }
}

export function successionLabel(stage: SuccessionStage): string {
  switch (stage) {
    case 'none':
      return 'Barren'
    case 'microbial':
      return 'Microbial mat'
    case 'algal':
      return 'Algal bloom'
    case 'pioneer_plants':
      return 'Pioneer plants'
    case 'grassland':
      return 'Grassland'
    case 'forest':
      return 'Forest'
    case 'swamp':
      return 'Swamp'
    case 'marsh':
      return 'Marsh'
    case 'mature':
      return 'Mature ecosystem'
    default:
      return stage
  }
}

export function isLandHabitat(tile: Tile): boolean {
  const t = effectiveHabitatTerrain(tile)
  return (
    t !== 'deep_ocean' &&
    t !== 'ocean' &&
    t !== 'void' &&
    t !== 'hydrothermal_vent' &&
    tile.terrain !== 'void'
  )
}

export function isAquaticHabitat(tile: Tile): boolean {
  const t = effectiveHabitatTerrain(tile)
  return t === 'deep_ocean' || t === 'ocean' || t === 'coast' || t === 'river' || tile.water > 0.55
}
