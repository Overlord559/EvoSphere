import type { CrashRiskLevel, SoakWarning } from '../../types/runtime'

/** Rolling soak metrics for browser long-run stability monitoring. */
export interface SoakTelemetrySnapshot {
  runtimeSeconds: number
  simulatedYear: number
  heapEstimateMb: number | null
  heapTrendMbPerMin: number | null
  snapshotKb: number
  pendingSnapshots: number
  snapshotsDropped: number
  workerMessagesPerSec: number
  snapshotsPerSec: number
  eventCount: number
  developmentCount: number
  pixiGraphicsCount: number
  pixiContainerCount: number
  renderTextureCount: number
  terrainCacheSize: number
  glyphCacheSize: number
  organismCount: number
  agentCount: number
  speciesCount: number
  maxTileOrganisms: number
  maxTileAgents: number
  birthsLastInterval: number
  deathsLastInterval: number
  rafLoopCount: number
  workerInstanceCount: number
  cameraMode: string
  cameraUpdatesPerSec: number
  crashRiskLevel: CrashRiskLevel
  warnings: SoakWarning[]
}

const HEAP_SAMPLES_MAX = 24

export class SoakTelemetryTracker {
  private startMs = performance.now()
  private heapSamples: { t: number; mb: number }[] = []
  private birthsInterval = 0
  private deathsInterval = 0
  private prevOrganisms = 0
  private cameraUpdatesWindow = 0
  private cameraUpdatesPerSec = 0
  private lastWindowMs = performance.now()

  recordBirthDeath(organismCount: number): void {
    const delta = organismCount - this.prevOrganisms
    if (delta > 0) this.birthsInterval += delta
    else if (delta < 0) this.deathsInterval += -delta
    this.prevOrganisms = organismCount
  }

  recordCameraUpdate(): void {
    this.cameraUpdatesWindow += 1
  }

  tickWindow(): void {
    const now = performance.now()
    const elapsed = (now - this.lastWindowMs) / 1000
    if (elapsed >= 1) {
      this.cameraUpdatesPerSec = this.cameraUpdatesWindow / elapsed
      this.cameraUpdatesWindow = 0
      this.lastWindowMs = now
    }
  }

  recordHeap(mb: number | null): void {
    if (mb === null) return
    const t = performance.now()
    this.heapSamples.push({ t, mb })
    if (this.heapSamples.length > HEAP_SAMPLES_MAX) {
      this.heapSamples.shift()
    }
  }

  flushInterval(): { births: number; deaths: number } {
    const births = this.birthsInterval
    const deaths = this.deathsInterval
    this.birthsInterval = 0
    this.deathsInterval = 0
    return { births, deaths }
  }

  heapTrendMbPerMin(): number | null {
    if (this.heapSamples.length < 3) return null
    const first = this.heapSamples[0]
    const last = this.heapSamples[this.heapSamples.length - 1]
    const dtMin = (last.t - first.t) / 60_000
    if (dtMin < 0.05) return null
    return Math.round(((last.mb - first.mb) / dtMin) * 10) / 10
  }

  buildWarnings(input: Omit<SoakTelemetrySnapshot, 'warnings' | 'runtimeSeconds' | 'heapTrendMbPerMin'>): SoakWarning[] {
    const warnings: SoakWarning[] = []
    const trend = this.heapTrendMbPerMin()

    if (trend !== null && trend > 2) {
      warnings.push({ code: 'heap_climbing', message: `Heap climbing ~${trend} MB/min`, severity: 'high' })
    }
    if (input.pendingSnapshots >= 2) {
      warnings.push({ code: 'snapshot_backlog', message: `Snapshot backlog (${input.pendingSnapshots} pending)`, severity: 'medium' })
    }
    if (input.pixiGraphicsCount > 12) {
      warnings.push({ code: 'pixi_objects', message: `Pixi Graphics count high (${input.pixiGraphicsCount})`, severity: 'high' })
    }
    if (input.rafLoopCount > 1) {
      warnings.push({ code: 'raf_duplicate', message: `Multiple RAF loops (${input.rafLoopCount})`, severity: 'critical' })
    }
    if (input.workerInstanceCount > 1) {
      warnings.push({ code: 'worker_duplicate', message: `Multiple workers suspected (${input.workerInstanceCount})`, severity: 'critical' })
    }
    if (input.terrainCacheSize > 4 || input.glyphCacheSize > 512) {
      warnings.push({
        code: 'cache_growth',
        message: `Cache growth (terrain ${input.terrainCacheSize}, glyph ${input.glyphCacheSize})`,
        severity: 'medium',
      })
    }
    if (
      (input.cameraMode === 'following_species' || input.cameraMode === 'focused_species') &&
      input.cameraUpdatesPerSec > 8
    ) {
      warnings.push({ code: 'follow_loop', message: 'Follow/focus camera loop active', severity: 'medium' })
    }
    if (input.snapshotsDropped > 0 && input.pendingSnapshots >= 1) {
      warnings.push({ code: 'snapshots_dropped', message: `${input.snapshotsDropped} snapshots dropped`, severity: 'low' })
    }

    return warnings
  }

  snapshot(partial: Omit<SoakTelemetrySnapshot, 'warnings' | 'runtimeSeconds' | 'heapTrendMbPerMin' | 'birthsLastInterval' | 'deathsLastInterval'>): SoakTelemetrySnapshot {
    this.tickWindow()
    this.recordHeap(partial.heapEstimateMb)
    const { births, deaths } = this.flushInterval()
    const runtimeSeconds = Math.round((performance.now() - this.startMs) / 10) / 100
    const heapTrendMbPerMin = this.heapTrendMbPerMin()
    const base = { ...partial, runtimeSeconds, heapTrendMbPerMin, birthsLastInterval: births, deathsLastInterval: deaths, cameraUpdatesPerSec: this.cameraUpdatesPerSec }
    return {
      ...base,
      warnings: this.buildWarnings(base),
    }
  }

  reset(): void {
    this.startMs = performance.now()
    this.heapSamples = []
    this.birthsInterval = 0
    this.deathsInterval = 0
    this.prevOrganisms = 0
    this.cameraUpdatesWindow = 0
    this.cameraUpdatesPerSec = 0
    this.lastWindowMs = performance.now()
  }
}

export const globalSoakTelemetry = new SoakTelemetryTracker()
