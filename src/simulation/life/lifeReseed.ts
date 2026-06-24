import type { LifeKind } from '../../types/life'
import type { World } from '../../types/simulation'
import { forkRng } from '../../utils/rng'
import { isTileActive } from '../world/planetMask'
import type { OriginScenarioId } from '../world/originScenarios'
import { ORIGIN_SCENARIOS, resolveOriginScenario } from '../world/originScenarios'

export type ReseedMode = 'default' | 'meteor' | 'vent' | 'coastal' | 'alien'

const RESEED_SCENARIO: Record<ReseedMode, OriginScenarioId> = {
  default: 'random_mixed',
  meteor: 'panspermia_meteor',
  vent: 'abiogenesis_vent',
  coastal: 'abiogenesis_coastal',
  alien: 'speculative_seeder',
}

export interface ReseedSite {
  x: number
  y: number
  lifeKind: LifeKind
}

/** Pick refugia tiles for manual/planet reseed — deterministic from seed + mode. */
export function findReseedSites(world: World, seed: string, mode: ReseedMode, maxSites = 8): ReseedSite[] {
  const scenarioId = RESEED_SCENARIO[mode]
  const settings = {
    seed: `${seed}-reseed-${mode}`,
    worldWidth: world.width,
    worldHeight: world.height,
    tickRate: 1,
    worldSizePreset: 'standard' as const,
    originScenarioId: scenarioId,
  }
  const resolved = resolveOriginScenario(settings, world)
  if (resolved.sites.length > 0) {
    return resolved.sites.slice(0, maxSites).map((s) => ({
      x: s.x,
      y: s.y,
      lifeKind: s.lifeKind,
    }))
  }

  const rng = forkRng(seed, `reseed-fallback-${mode}`)
  const sites: ReseedSite[] = []
  const kind: LifeKind =
    mode === 'vent'
      ? 'ChemosyntheticMicrobe'
      : mode === 'coastal'
        ? 'PhotosyntheticMicrobe'
        : mode === 'meteor'
          ? 'Microbe'
          : 'Algae'

  for (const tile of world.tiles) {
    if (sites.length >= maxSites) break
    if (!isTileActive(world, tile.x, tile.y)) continue
    if (tile.terrain === 'void') continue
    if (mode === 'vent' && tile.terrain !== 'hydrothermal_vent') continue
    if (mode === 'coastal' && tile.terrain !== 'coast' && tile.terrain !== 'river') continue
    if (rng() > 0.015) continue
    sites.push({ x: tile.x, y: tile.y, lifeKind: kind })
  }
  return sites
}

export function reseedEventMessage(mode: ReseedMode, siteCount: number): string {
  const scenario = ORIGIN_SCENARIOS[RESEED_SCENARIO[mode]]
  const prefix = scenario.scientific ? '' : '[SPECULATIVE] '
  return `${prefix}Life reseeded (${scenario.label}) — ${siteCount} founder site(s). ${scenario.eventLogExplanation}`
}

export { RESEED_SCENARIO }
