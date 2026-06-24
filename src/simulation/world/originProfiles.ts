import type { LifeKind } from '../../types/life'
import type { SimulationSettings, TerrainType, World } from '../../types/simulation'
import {
  ORIGIN_SCENARIOS,
  resolveOriginScenario,
  type OriginScenarioId,
} from './originScenarios'

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
  originScenarioId: OriginScenarioId
  originScenarioLabel: string
  scientificOrigin: boolean
}

/** Deterministic origin profile — same seed + scenario always yields same origins. */
export function buildOriginProfile(settings: SimulationSettings, world: World): OriginProfile {
  const resolved = resolveOriginScenario(settings, world)
  const { scenario, sites, explanation } = resolved

  const mappedSites: OriginSite[] = sites.map((s) => ({
    tileIndex: s.tileIndex,
    x: s.x,
    y: s.y,
    terrain: s.terrain,
    energySource: s.energySource,
    lifeKind: s.lifeKind,
  }))

  const biomes = [...new Set(mappedSites.map((s) => s.terrain))]
  const energies = [...new Set(mappedSites.map((s) => s.energySource))]

  return {
    originProfileName: scenario.originScenarioId,
    founderTileIds: mappedSites.map((s) => s.tileIndex),
    originBiomeTypes: biomes,
    originEnergySources: energies,
    explanation,
    sites: mappedSites,
    originScenarioId: scenario.originScenarioId,
    originScenarioLabel: scenario.scientific ? scenario.label : `[SPECULATIVE] ${scenario.label}`,
    scientificOrigin: scenario.scientific,
  }
}

export { ORIGIN_SCENARIOS, resolveOriginScenario }
