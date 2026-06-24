import type { World } from '../../types/simulation'
import { countActiveTiles } from '../world/planetMask'

/** Legacy global caps — demoted to reference thresholds, not growth limiters. */
export const LEGACY_MAX_TOTAL_ORGANISMS = 5000
export const LEGACY_MAX_TOTAL_AGENTS = 800

export interface PopulationArchitectureConfig {
  /** Max individually tracked producer/mobile life entities (performance budget). */
  maxTrackedIndividuals: number
  /** Max individually tracked mobile agents. */
  maxTrackedAgents: number
  /** Render-only agent draw budget (does not limit simulation population). */
  maxRenderedAgents: number
  /** When true, excess population flows into aggregate pools instead of blocking growth. */
  aggregatePopulationEnabled: boolean
  /** Scale tracked/render budgets with active world area. */
  populationScaleByWorldArea: boolean
  /** Hard safety ceiling for tracked + cohort combined (producers). */
  safetyOrganismCeiling: number
  /** Hard safety ceiling for tracked + cohort combined (mobile). */
  safetyAgentCeiling: number
  /** Max bounded population unit records (representation budget). */
  maxPopulationUnitsTotal: number
  /** Active tiles used for scaling. */
  activeTileCount: number
}

const DEFAULT_CONFIG: Omit<PopulationArchitectureConfig, 'activeTileCount'> = {
  maxTrackedIndividuals: 4000,
  maxTrackedAgents: 600,
  maxRenderedAgents: 800,
  aggregatePopulationEnabled: true,
  populationScaleByWorldArea: true,
  safetyOrganismCeiling: 25000,
  safetyAgentCeiling: 2000,
  maxPopulationUnitsTotal: 1800,
}

/** Build world-size-aware population architecture config. */
export function buildPopulationConfig(world: World): PopulationArchitectureConfig {
  const activeTileCount = countActiveTiles(world)
  const smallRef = 96 * 96 * Math.PI * 0.85
  const areaScale = Math.max(0.5, Math.min(4, activeTileCount / smallRef))

  if (!DEFAULT_CONFIG.populationScaleByWorldArea) {
    return { ...DEFAULT_CONFIG, activeTileCount }
  }

  return {
    maxTrackedIndividuals: Math.round(1800 + activeTileCount * 0.1 * areaScale),
    maxTrackedAgents: Math.round(350 + activeTileCount * 0.018 * areaScale),
    maxRenderedAgents: Math.round(600 + areaScale * 100),
    aggregatePopulationEnabled: true,
    populationScaleByWorldArea: true,
    safetyOrganismCeiling: Math.round(12000 + activeTileCount * 0.45),
    safetyAgentCeiling: Math.round(1600 + activeTileCount * 0.04),
    maxPopulationUnitsTotal: 1800,
    activeTileCount,
  }
}

export function getPopulationConfigForWorld(world: World): PopulationArchitectureConfig {
  return buildPopulationConfig(world)
}
