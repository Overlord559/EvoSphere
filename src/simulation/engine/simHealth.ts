import type { CrashRiskLevel, SoakWarning } from '../../types/runtime'

import {
  MAX_EVENTS_RETAINED,
  MAX_GLYPH_CACHE_ENTRIES,
  MAX_PENDING_SNAPSHOTS,
  MAX_TERRAIN_CACHE_ENTRIES,
  RUNAWAY_AGENT_POPULATION,
  RUNAWAY_ORGANISM_POPULATION,
} from './stabilityGuards'
import { LEGACY_MAX_TOTAL_ORGANISMS } from '../ecology/populationConfig'

export interface SimHealthInput {
  organismCount: number
  agentCount: number
  biologicalPopulation?: number
  eventCount: number
  developmentCount: number
  maxTileOrganisms: number
  maxTileAgents: number
  pendingSnapshots: number
  snapshotsDropped: number
  pixiGraphicsCount: number
  pixiContainerCount: number
  renderTextureCount: number
  terrainCacheSize: number
  glyphCacheSize: number
  snapshotBytesEstimate: number
  rafLoopCount: number
  workerInstanceCount: number
  heapTrendMbPerMin?: number | null
  cameraMode?: string
  cameraUpdatesPerSec?: number
  tickMsTrend?: number
  stabilityWarning?: string | null
  soakWarnings?: SoakWarning[]
}

export function estimateSnapshotBytes(snapshot: {
  life: { tileCounts: number[]; organisms: unknown[] }
  agents: { agents: unknown[] }
  events: unknown[]
}): number {
  return (
    snapshot.life.tileCounts.length * 2 +
    snapshot.life.organisms.length * 420 +
    snapshot.agents.agents.length * 680 +
    snapshot.events.length * 120 +
    4096
  )
}

export function computeCrashRisk(input: SimHealthInput): CrashRiskLevel {
  if (input.stabilityWarning) return 'critical'
  if (input.soakWarnings?.some((w) => w.severity === 'critical')) return 'critical'
  if (input.rafLoopCount > 1 || input.workerInstanceCount > 1) return 'critical'
  if (input.pendingSnapshots >= MAX_PENDING_SNAPSHOTS) return 'high'
  if (input.pixiGraphicsCount > 12) return 'high'
  if (input.pixiContainerCount > 24) return 'high'
  if (input.organismCount > RUNAWAY_ORGANISM_POPULATION * 0.9) return 'high'
  if (input.agentCount > RUNAWAY_AGENT_POPULATION * 0.85) return 'high'
  if (input.eventCount > MAX_EVENTS_RETAINED) return 'critical'
  if (input.heapTrendMbPerMin !== undefined && input.heapTrendMbPerMin !== null && input.heapTrendMbPerMin > 3) {
    return 'high'
  }
  if (input.terrainCacheSize > MAX_TERRAIN_CACHE_ENTRIES || input.glyphCacheSize > MAX_GLYPH_CACHE_ENTRIES) {
    return 'medium'
  }
  if (input.maxTileOrganisms > 4 || input.maxTileAgents > 3) return 'medium'
  if (input.organismCount > LEGACY_MAX_TOTAL_ORGANISMS * 0.75 && (input.biologicalPopulation ?? input.organismCount) < LEGACY_MAX_TOTAL_ORGANISMS * 1.2) {
    return 'medium'
  }
  if (input.snapshotBytesEstimate > 2_000_000) return 'medium'
  if (input.tickMsTrend !== undefined && input.tickMsTrend > 40) return 'medium'
  if (
    input.cameraUpdatesPerSec !== undefined &&
    input.cameraUpdatesPerSec > 10 &&
    (input.cameraMode === 'following_species' || input.cameraMode === 'focused_species')
  ) {
    return 'medium'
  }
  if (input.soakWarnings?.some((w) => w.severity === 'high')) return 'high'
  return 'low'
}

export function readHeapEstimateMb(): number | null {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number }
  }
  if (!perf.memory?.usedJSHeapSize) return null
  return Math.round((perf.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
}

export { RUNAWAY_ORGANISM_POPULATION, RUNAWAY_AGENT_POPULATION, LEGACY_MAX_TOTAL_ORGANISMS }
