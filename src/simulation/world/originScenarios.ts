import type { LifeKind } from '../../types/life'
import type { SimulationSettings, TerrainType, World } from '../../types/simulation'
import { forkRng, randomInt } from '../../utils/rng'
import { isTileActive } from './planetMask'

export type OriginScenarioId =
  | 'abiogenesis_vent'
  | 'abiogenesis_coastal'
  | 'abiogenesis_freshwater'
  | 'abiogenesis_volcanic'
  | 'panspermia_meteor'
  | 'panspermia_icy_moon'
  | 'speculative_seeder'
  | 'random_mixed'

export interface OriginScenario {
  originScenarioId: OriginScenarioId
  label: string
  /** false = speculative / non-default science mode */
  scientific: boolean
  energySource: string
  rarity: number
  eventLogExplanation: string
  visualMarker?: string
  /** Primary life kinds introduced at origin tiles */
  lifeKinds: LifeKind[]
  worldgenConstraints?: {
    preferTerrains?: TerrainType[]
    minVentTiles?: number
    minCoastTiles?: number
  }
}

export interface OriginScenarioSite {
  tileIndex: number
  x: number
  y: number
  terrain: TerrainType
  energySource: string
  lifeKind: LifeKind
  scenarioId: OriginScenarioId
}

export interface ResolvedOriginScenario {
  scenario: OriginScenario
  sites: OriginScenarioSite[]
  explanation: string
}

export const ORIGIN_SCENARIOS: Record<OriginScenarioId, OriginScenario> = {
  abiogenesis_vent: {
    originScenarioId: 'abiogenesis_vent',
    label: 'Abiogenesis — hydrothermal vents',
    scientific: true,
    energySource: 'chemosynthesis',
    rarity: 1,
    lifeKinds: ['ChemosyntheticMicrobe'],
    eventLogExplanation:
      'Life began at deep-ocean hydrothermal vents via chemosynthetic metabolism.',
    visualMarker: 'vent-glow',
    worldgenConstraints: { preferTerrains: ['hydrothermal_vent'], minVentTiles: 2 },
  },
  abiogenesis_coastal: {
    originScenarioId: 'abiogenesis_coastal',
    label: 'Abiogenesis — shallow coastal chemistry',
    scientific: true,
    energySource: 'sunlight + water',
    rarity: 1,
    lifeKinds: ['PhotosyntheticMicrobe', 'Algae'],
    eventLogExplanation:
      'Life began in shallow coastal chemistry pools with photosynthetic microbial mats.',
    visualMarker: 'coastal-mat',
    worldgenConstraints: { preferTerrains: ['coast', 'river'], minCoastTiles: 4 },
  },
  abiogenesis_freshwater: {
    originScenarioId: 'abiogenesis_freshwater',
    label: 'Abiogenesis — freshwater basin',
    scientific: true,
    energySource: 'nutrients + sunlight',
    rarity: 0.85,
    lifeKinds: ['Microbe', 'Algae'],
    eventLogExplanation:
      'Life began in isolated freshwater basins with nutrient-rich shallow water.',
    worldgenConstraints: { preferTerrains: ['basin', 'river', 'fertile_plain'] },
  },
  abiogenesis_volcanic: {
    originScenarioId: 'abiogenesis_volcanic',
    label: 'Abiogenesis — volcanic/mineral pools',
    scientific: true,
    energySource: 'mineral chemistry',
    rarity: 0.9,
    lifeKinds: ['ChemosyntheticMicrobe', 'Microbe'],
    eventLogExplanation:
      'Life began in volcanic mineral pools with chemotrophic founder populations.',
    worldgenConstraints: { preferTerrains: ['volcanic'] },
  },
  panspermia_meteor: {
    originScenarioId: 'panspermia_meteor',
    label: 'Panspermia — meteor/comet delivery',
    scientific: true,
    energySource: 'exogenous organics + sunlight',
    rarity: 0.35,
    lifeKinds: ['Microbe', 'PhotosyntheticMicrobe'],
    eventLogExplanation:
      'Organic precursors delivered by meteor/comet impact seeded founder microbes at impact sites.',
    visualMarker: 'meteor-crater',
  },
  panspermia_icy_moon: {
    originScenarioId: 'panspermia_icy_moon',
    label: 'Panspermia — icy moon fragment',
    scientific: true,
    energySource: 'ice melt + organics',
    rarity: 0.25,
    lifeKinds: ['Microbe', 'ChemosyntheticMicrobe'],
    eventLogExplanation:
      'An icy moon fragment delivered frozen organics to polar/coastal zones — thaw seeded life.',
    visualMarker: 'ice-fragment',
  },
  speculative_seeder: {
    originScenarioId: 'speculative_seeder',
    label: 'Speculative Seeder — alien probe (fiction)',
    scientific: false,
    energySource: 'unknown artifact',
    rarity: 0.08,
    lifeKinds: ['Microbe', 'PhotosyntheticMicrobe', 'Algae'],
    eventLogExplanation:
      '[SPECULATIVE] An unknown artifact/probe deposited engineered precursor microbes — not default science mode.',
    visualMarker: 'seeder-artifact',
  },
  random_mixed: {
    originScenarioId: 'random_mixed',
    label: 'Random Mixed Origins',
    scientific: true,
    energySource: 'mixed natural',
    rarity: 1,
    lifeKinds: ['Microbe', 'PhotosyntheticMicrobe', 'ChemosyntheticMicrobe', 'Algae', 'PrimitivePlant'],
    eventLogExplanation:
      'Multiple plausible natural origin sites seeded independently (deterministic mix from seed).',
  },
}

export const DEFAULT_ORIGIN_SCENARIO: OriginScenarioId = 'random_mixed'

export const ORIGIN_SCENARIO_LIST = Object.values(ORIGIN_SCENARIOS)

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x
}


function collectTiles(world: World, match: (tile: import('../../types/simulation').Tile) => boolean): OriginScenarioSite[] {
  const sites: OriginScenarioSite[] = []
  for (const tile of world.tiles) {
    if (!isTileActive(world, tile.x, tile.y)) continue
    if (tile.terrain === 'void') continue
    if (!match(tile)) continue
    sites.push({
      tileIndex: tileIndex(tile.x, tile.y, world.width),
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      energySource: '',
      lifeKind: 'Microbe',
      scenarioId: 'random_mixed',
    })
  }
  return sites
}

function pickSites(
  rng: ReturnType<typeof forkRng>,
  candidates: OriginScenarioSite[],
  count: number,
  scenario: OriginScenario,
): OriginScenarioSite[] {
  if (candidates.length === 0) return []
  const pool = [...candidates]
  const picked: OriginScenarioSite[] = []
  while (picked.length < count && pool.length > 0) {
    const i = randomInt(rng, 0, pool.length - 1)
    const site = pool[i]
    picked.push({
      ...site,
      energySource: scenario.energySource,
      lifeKind: scenario.lifeKinds[randomInt(rng, 0, scenario.lifeKinds.length - 1)],
      scenarioId: scenario.originScenarioId,
    })
    pool.splice(i, 1)
  }
  return picked
}

function scenarioCandidates(scenario: OriginScenario, world: World): OriginScenarioSite[] {
  switch (scenario.originScenarioId) {
    case 'abiogenesis_vent':
      return collectTiles(world, (t) => t.terrain === 'hydrothermal_vent')
    case 'abiogenesis_coastal':
      return collectTiles(
        world,
        (t) =>
          (t.terrain === 'coast' || t.terrain === 'river') && t.water > 0.45 && t.temperature > 0.35,
      )
    case 'abiogenesis_freshwater':
      return collectTiles(
        world,
        (t) =>
          (t.terrain === 'basin' || t.terrain === 'river' || t.terrain === 'fertile_plain') &&
          t.water > 0.4 &&
          t.moisture > 0.45,
      )
    case 'abiogenesis_volcanic':
      return collectTiles(world, (t) => t.terrain === 'volcanic' && t.resourceDeposits > 0.35)
    case 'panspermia_meteor':
      return collectTiles(
        world,
        (t) =>
          (t.terrain === 'coast' || t.terrain === 'barren' || t.terrain === 'rock') &&
          t.resourceDeposits > 0.2,
      )
    case 'panspermia_icy_moon':
      return collectTiles(
        world,
        (t) =>
          (t.terrain === 'snow' || t.terrain === 'coast' || t.terrain === 'tundra') &&
          t.temperature < 0.4,
      )
    case 'speculative_seeder':
      return collectTiles(
        world,
        (t) =>
          (t.terrain === 'fertile_plain' || t.terrain === 'coast' || t.terrain === 'basin') &&
          t.soilFertility > 0.4,
      )
    case 'random_mixed':
    default:
      return []
  }
}

function buildMixedOrigins(settings: SimulationSettings, world: World): ResolvedOriginScenario {
  const rng = forkRng(settings.seed, 'origin-mixed')
  const naturalIds: OriginScenarioId[] = [
    'abiogenesis_vent',
    'abiogenesis_coastal',
    'abiogenesis_freshwater',
    'abiogenesis_volcanic',
    'panspermia_meteor',
    'panspermia_icy_moon',
  ]

  const sites: OriginScenarioSite[] = []
  for (const id of naturalIds) {
    const scenario = ORIGIN_SCENARIOS[id]
    const candidates = scenarioCandidates(scenario, world)
    if (candidates.length === 0) continue
    if (rng() > 0.45 + scenario.rarity * 0.2) continue
    sites.push(...pickSites(rng, candidates, randomInt(rng, 1, 3), scenario))
  }

  if (sites.length === 0) {
    const fallback = ORIGIN_SCENARIOS.abiogenesis_coastal
    const candidates = scenarioCandidates(fallback, world)
    sites.push(...pickSites(rng, candidates, Math.min(4, candidates.length), fallback))
  }

  const capped = sites.slice(0, 24)
  const scenario = ORIGIN_SCENARIOS.random_mixed
  return {
    scenario,
    sites: capped,
    explanation: `${scenario.eventLogExplanation} (${capped.length} founder sites)`,
  }
}

/** Resolve origin scenario deterministically from settings + world terrain. */
export function resolveOriginScenario(
  settings: SimulationSettings,
  world: World,
): ResolvedOriginScenario {
  const scenarioId = settings.originScenarioId ?? DEFAULT_ORIGIN_SCENARIO
  const scenario = ORIGIN_SCENARIOS[scenarioId] ?? ORIGIN_SCENARIOS[DEFAULT_ORIGIN_SCENARIO]

  if (scenarioId === 'random_mixed') {
    return buildMixedOrigins(settings, world)
  }

  const rng = forkRng(settings.seed, `origin-${scenarioId}`)
  const candidates = scenarioCandidates(scenario, world)
  if (candidates.length === 0) {
    return buildMixedOrigins(settings, world)
  }

  const siteCount = Math.min(12, Math.max(2, Math.floor(candidates.length * 0.08) + randomInt(rng, 2, 6)))
  const sites = pickSites(rng, candidates, siteCount, scenario)

  const label = scenario.scientific ? scenario.label : `[SPECULATIVE] ${scenario.label}`
  return {
    scenario,
    sites,
    explanation: `${label}: ${scenario.eventLogExplanation} (${sites.length} sites)`,
  }
}

export function originScenarioLabel(id: OriginScenarioId): string {
  return ORIGIN_SCENARIOS[id]?.label ?? id
}
