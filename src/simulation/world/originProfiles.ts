import type { LifeKind } from '../../types/life'
import type { SimulationSettings, TerrainType, Tile, World } from '../../types/simulation'
import { forkRng, randomInt } from '../../utils/rng'
import { isTileActive } from './planetMask'

export interface OriginSite {
  tileIndex: number
  x: number
  y: number
  terrain: TerrainType
  energySource: string
  lifeKind: LifeKind
}

export interface OriginProfile {
  originProfileName: string
  founderTileIds: number[]
  originBiomeTypes: TerrainType[]
  originEnergySources: string[]
  explanation: string
  sites: OriginSite[]
}

interface OriginStrategy {
  name: string
  energySource: string
  explanation: string
  lifeKind: LifeKind
  match: (tile: Tile) => boolean
  weight: number
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x
}

function collectCandidates(world: World, strategies: OriginStrategy[]): Map<string, OriginSite[]> {
  const buckets = new Map<string, OriginSite[]>()
  for (const s of strategies) {
    buckets.set(s.name, [])
  }

  for (const tile of world.tiles) {
    if (!isTileActive(world, tile.x, tile.y)) continue
    if (tile.terrain === 'void') continue
    const idx = tileIndex(tile.x, tile.y, world.width)
    for (const strategy of strategies) {
      if (strategy.match(tile)) {
        buckets.get(strategy.name)!.push({
          tileIndex: idx,
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          energySource: strategy.energySource,
          lifeKind: strategy.lifeKind,
        })
      }
    }
  }
  return buckets
}

function pickSites(
  rng: ReturnType<typeof forkRng>,
  candidates: OriginSite[],
  count: number,
): OriginSite[] {
  if (candidates.length === 0) return []
  const picked: OriginSite[] = []
  const pool = [...candidates]
  while (picked.length < count && pool.length > 0) {
    const i = randomInt(rng, 0, pool.length - 1)
    picked.push(pool[i])
    pool.splice(i, 1)
  }
  return picked
}

/** Deterministic origin profile — same seed always yields same origins. */
export function buildOriginProfile(settings: SimulationSettings, world: World): OriginProfile {
  const rng = forkRng(settings.seed, 'origin-profile')

  const strategies: OriginStrategy[] = [
    {
      name: 'hydrothermal_vent',
      energySource: 'chemosynthesis',
      explanation: 'Deep-ocean hydrothermal vents seeded chemosynthetic founder lineages.',
      lifeKind: 'ChemosyntheticMicrobe',
      weight: 1,
      match: (t) => t.terrain === 'hydrothermal_vent',
    },
    {
      name: 'shallow_coastal',
      energySource: 'sunlight + water',
      explanation: 'Shallow coastal zones seeded photosynthetic microbial mats.',
      lifeKind: 'PhotosyntheticMicrobe',
      weight: 1,
      match: (t) =>
        (t.terrain === 'coast' || t.terrain === 'river') && t.water > 0.45 && t.temperature > 0.35,
    },
    {
      name: 'swamp_mat',
      energySource: 'sunlight + nutrients',
      explanation: 'Warm swamp and marsh mats seeded microbial and algal founders.',
      lifeKind: 'Algae',
      weight: 1,
      match: (t) =>
        (t.terrain === 'swamp' || t.terrain === 'marsh') && t.moisture > 0.6 && t.water > 0.4,
    },
    {
      name: 'tundra_extremophile',
      energySource: 'cold-adapted metabolism',
      explanation: 'Cold tundra and snow margins seeded extremophile microbes.',
      lifeKind: 'Microbe',
      weight: 1,
      match: (t) =>
        (t.terrain === 'tundra' || t.terrain === 'snow') && t.temperature < 0.35,
    },
    {
      name: 'volcanic_mineral',
      energySource: 'mineral chemistry',
      explanation: 'Volcanic mineral zones seeded chemotrophic founder populations.',
      lifeKind: 'ChemosyntheticMicrobe',
      weight: 1,
      match: (t) => t.terrain === 'volcanic' && t.resourceDeposits > 0.35,
    },
    {
      name: 'island_basin',
      energySource: 'isolated nutrients',
      explanation: 'Isolated fertile basins seeded land-adapted primitive plants.',
      lifeKind: 'PrimitivePlant',
      weight: 1,
      match: (t) =>
        (t.terrain === 'grassland' || t.terrain === 'forest') &&
        t.soilFertility > 0.45 &&
        t.water > 0.3 &&
        t.elevation > 0.42 &&
        t.elevation < 0.62,
    },
    {
      name: 'open_ocean',
      energySource: 'sunlight',
      explanation: 'Open ocean zones seeded drifting algae colonies.',
      lifeKind: 'Algae',
      weight: 1,
      match: (t) =>
        (t.terrain === 'ocean' || t.terrain === 'coast') && t.water > 0.55,
    },
  ]

  const buckets = collectCandidates(world, strategies)

  // Weighted primary strategy selection
  const available = strategies.filter((s) => (buckets.get(s.name)?.length ?? 0) > 0)
  if (available.length === 0) {
    return {
      originProfileName: 'fallback_barren',
      founderTileIds: [],
      originBiomeTypes: [],
      originEnergySources: [],
      explanation: 'No suitable origin tiles found — life may colonize later.',
      sites: [],
    }
  }

  const primaryIdx = randomInt(rng, 0, available.length - 1)
  const primary = available[primaryIdx]
  const primaryCandidates = buckets.get(primary.name) ?? []

  const sites: OriginSite[] = []
  sites.push(...pickSites(rng, primaryCandidates, Math.min(6, primaryCandidates.length)))

  // Secondary origins from other strategies (1–3 each)
  for (const strategy of available) {
    if (strategy.name === primary.name) continue
    if (rng() > 0.55) continue
    const extra = pickSites(rng, buckets.get(strategy.name) ?? [], randomInt(rng, 1, 3))
    sites.push(...extra)
  }

  // Cap total founder sites
  const capped = sites.slice(0, 24)
  const biomes = [...new Set(capped.map((s) => s.terrain))]
  const energies = [...new Set(capped.map((s) => s.energySource))]

  const profileName = `${primary.name}${capped.length > 6 ? '_multi' : ''}`

  return {
    originProfileName: profileName,
    founderTileIds: capped.map((s) => s.tileIndex),
    originBiomeTypes: biomes,
    originEnergySources: energies,
    explanation: `${primary.explanation} (${capped.length} founder sites across ${biomes.length} biome types)`,
    sites: capped,
  }
}
