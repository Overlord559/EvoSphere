import type { SimulationSettings } from '../../types/simulation'
import { forkRng } from '../../utils/rng'

export type WorldArchetypeId =
  | 'ocean_world'
  | 'island_world'
  | 'ice_world'
  | 'volcanic_world'
  | 'mountain_world'
  | 'basin_world'
  | 'earthlike'
  | 'harsh_desert'
  | 'random'

export interface WorldArchetype {
  id: WorldArchetypeId
  label: string
  /** Sea level offset — negative = more ocean */
  seaLevelOffset: number
  /** Moisture bias multiplier */
  moistureBias: number
  /** Temperature bias (-1 cold … +1 hot) */
  temperatureBias: number
  /** Ridge/mountain strength multiplier */
  ridgeStrength: number
  /** Vent spawn rate multiplier */
  ventDensity: number
  /** Volcanic terrain rate multiplier */
  volcanicActivity: number
  /** River/carve count multiplier */
  riverFrequency: number
  /** Polar ice extent multiplier */
  polarIceExtent: number
  /** Shallow coast band width multiplier */
  coastBandMultiplier: number
}

export const WORLD_ARCHETYPES: Record<WorldArchetypeId, WorldArchetype> = {
  ocean_world: {
    id: 'ocean_world',
    label: 'Ocean world',
    seaLevelOffset: 0.08,
    moistureBias: 1.15,
    temperatureBias: 0,
    ridgeStrength: 0.7,
    ventDensity: 1.4,
    volcanicActivity: 0.9,
    riverFrequency: 0.8,
    polarIceExtent: 0.9,
    coastBandMultiplier: 1.2,
  },
  island_world: {
    id: 'island_world',
    label: 'Island world',
    seaLevelOffset: 0.04,
    moistureBias: 1.05,
    temperatureBias: 0.05,
    ridgeStrength: 1.1,
    ventDensity: 1,
    volcanicActivity: 1.3,
    riverFrequency: 0.9,
    polarIceExtent: 0.7,
    coastBandMultiplier: 1.4,
  },
  ice_world: {
    id: 'ice_world',
    label: 'Ice world',
    seaLevelOffset: -0.02,
    moistureBias: 0.95,
    temperatureBias: -0.22,
    ridgeStrength: 0.85,
    ventDensity: 0.8,
    volcanicActivity: 0.6,
    riverFrequency: 0.5,
    polarIceExtent: 1.8,
    coastBandMultiplier: 0.9,
  },
  volcanic_world: {
    id: 'volcanic_world',
    label: 'Volcanic world',
    seaLevelOffset: -0.03,
    moistureBias: 0.9,
    temperatureBias: 0.12,
    ridgeStrength: 1.25,
    ventDensity: 2.2,
    volcanicActivity: 2.5,
    riverFrequency: 0.7,
    polarIceExtent: 0.5,
    coastBandMultiplier: 1,
  },
  mountain_world: {
    id: 'mountain_world',
    label: 'Mountain world',
    seaLevelOffset: -0.05,
    moistureBias: 1,
    temperatureBias: -0.08,
    ridgeStrength: 1.6,
    ventDensity: 1.1,
    volcanicActivity: 1.2,
    riverFrequency: 1.3,
    polarIceExtent: 1.2,
    coastBandMultiplier: 0.85,
  },
  basin_world: {
    id: 'basin_world',
    label: 'Basin / lake world',
    seaLevelOffset: 0.02,
    moistureBias: 1.25,
    temperatureBias: 0,
    ridgeStrength: 0.75,
    ventDensity: 0.9,
    volcanicActivity: 0.8,
    riverFrequency: 1.5,
    polarIceExtent: 0.8,
    coastBandMultiplier: 1.1,
  },
  earthlike: {
    id: 'earthlike',
    label: 'Balanced Earth-like',
    seaLevelOffset: 0,
    moistureBias: 1,
    temperatureBias: 0,
    ridgeStrength: 1,
    ventDensity: 1,
    volcanicActivity: 1,
    riverFrequency: 1,
    polarIceExtent: 1,
    coastBandMultiplier: 1,
  },
  harsh_desert: {
    id: 'harsh_desert',
    label: 'Harsh desert world',
    seaLevelOffset: -0.06,
    moistureBias: 0.55,
    temperatureBias: 0.18,
    ridgeStrength: 0.9,
    ventDensity: 0.7,
    volcanicActivity: 1.1,
    riverFrequency: 0.4,
    polarIceExtent: 0.4,
    coastBandMultiplier: 0.75,
  },
  random: {
    id: 'random',
    label: 'Random archetype',
    seaLevelOffset: 0,
    moistureBias: 1,
    temperatureBias: 0,
    ridgeStrength: 1,
    ventDensity: 1,
    volcanicActivity: 1,
    riverFrequency: 1,
    polarIceExtent: 1,
    coastBandMultiplier: 1,
  },
}

export const DEFAULT_WORLD_ARCHETYPE: WorldArchetypeId = 'earthlike'

const RANDOM_POOL: WorldArchetypeId[] = [
  'ocean_world',
  'island_world',
  'ice_world',
  'volcanic_world',
  'mountain_world',
  'basin_world',
  'earthlike',
  'harsh_desert',
]

/** Resolve archetype modifiers deterministically from seed. */
export function resolveWorldArchetype(settings: SimulationSettings): WorldArchetype {
  const id = settings.worldArchetype ?? DEFAULT_WORLD_ARCHETYPE
  if (id !== 'random') {
    return WORLD_ARCHETYPES[id] ?? WORLD_ARCHETYPES.earthlike
  }
  const rng = forkRng(settings.seed, 'world-archetype')
  const pick = RANDOM_POOL[Math.floor(rng() * RANDOM_POOL.length)]
  return WORLD_ARCHETYPES[pick]
}

export function worldArchetypeLabel(id: WorldArchetypeId): string {
  return WORLD_ARCHETYPES[id]?.label ?? id
}
