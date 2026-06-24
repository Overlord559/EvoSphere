/** Per-subsystem timing accumulator for simulation profiling. */

export type ProfileCategory =
  | 'lifeTick'
  | 'agentTick'
  | 'senseScan'
  | 'environmentalFitness'
  | 'speciesMetrics'
  | 'snapshotBuild'
  | 'briefingBuild'
  | 'stabilityGuards'
  | 'disasterTick'
  | 'successionTick'
  | 'renderRedraw'
  | 'workerMessage'

export interface ProfileSample {
  category: ProfileCategory
  ms: number
  tick?: number
}

export interface ProfileSummary {
  category: ProfileCategory
  totalMs: number
  count: number
  avgMs: number
  maxMs: number
  pctOfTotal: number
}

export interface PerformanceReport {
  summaries: ProfileSummary[]
  topBottlenecks: ProfileSummary[]
  totalMs: number
  frameCount: number
  /** Estimated main-thread vs simulation split when worker disabled. */
  mainThreadMs: number
  simulationMs: number
  renderMs: number
  eventsRetained: number
  pixiObjectEstimate: number
  workerMessagesPerSec: number
  snapshotsPerSec: number
  simTicksPerSec: number
}

const CATEGORIES: ProfileCategory[] = [
  'lifeTick',
  'agentTick',
  'senseScan',
  'environmentalFitness',
  'speciesMetrics',
  'snapshotBuild',
  'briefingBuild',
  'stabilityGuards',
  'renderRedraw',
  'workerMessage',
]

export class PerformanceProfiler {
  private totals = new Map<ProfileCategory, { sum: number; count: number; max: number }>()
  private windowStart = performance.now()
  private frameCount = 0
  private ticksInWindow = 0
  private snapshotsInWindow = 0
  private workerMessagesInWindow = 0
  private eventsRetained = 0
  private pixiObjectEstimate = 0
  private renderMsWindow = 0
  private enabled = true

  setEnabled(value: boolean): void {
    this.enabled = value
  }

  record(category: ProfileCategory, ms: number): void {
    if (!this.enabled || ms < 0) return
    const prev = this.totals.get(category) ?? { sum: 0, count: 0, max: 0 }
    prev.sum += ms
    prev.count += 1
    prev.max = Math.max(prev.max, ms)
    this.totals.set(category, prev)
  }

  recordFrame(ticks = 0, snapshot = false, workerMessage = false): void {
    this.frameCount += 1
    this.ticksInWindow += ticks
    if (snapshot) this.snapshotsInWindow += 1
    if (workerMessage) this.workerMessagesInWindow += 1
  }

  recordRenderMs(ms: number): void {
    this.renderMsWindow += ms
    this.record('renderRedraw', ms)
  }

  setEventsRetained(count: number): void {
    this.eventsRetained = count
  }

  setPixiObjectEstimate(count: number): void {
    this.pixiObjectEstimate = count
  }

  /** Wrap a synchronous block with timing. */
  time<T>(category: ProfileCategory, fn: () => T): T {
    const start = performance.now()
    const result = fn()
    this.record(category, performance.now() - start)
    return result
  }

  resetWindow(): void {
    this.totals.clear()
    this.windowStart = performance.now()
    this.frameCount = 0
    this.ticksInWindow = 0
    this.snapshotsInWindow = 0
    this.workerMessagesInWindow = 0
    this.renderMsWindow = 0
  }

  buildReport(): PerformanceReport {
    const elapsedSec = Math.max(0.001, (performance.now() - this.windowStart) / 1000)
    let totalMs = 0
    const summaries: ProfileSummary[] = []

    for (const category of CATEGORIES) {
      const data = this.totals.get(category)
      if (!data || data.count === 0) continue
      totalMs += data.sum
      summaries.push({
        category,
        totalMs: data.sum,
        count: data.count,
        avgMs: data.sum / data.count,
        maxMs: data.max,
        pctOfTotal: 0,
      })
    }

    for (const s of summaries) {
      s.pctOfTotal = totalMs > 0 ? (s.totalMs / totalMs) * 100 : 0
    }

    summaries.sort((a, b) => b.totalMs - a.totalMs)
    const topBottlenecks = summaries.slice(0, 5)

    const simulationMs =
      (this.totals.get('lifeTick')?.sum ?? 0) +
      (this.totals.get('agentTick')?.sum ?? 0) +
      (this.totals.get('senseScan')?.sum ?? 0) +
      (this.totals.get('environmentalFitness')?.sum ?? 0) +
      (this.totals.get('speciesMetrics')?.sum ?? 0) +
      (this.totals.get('stabilityGuards')?.sum ?? 0)

    const mainThreadMs =
      simulationMs +
      (this.totals.get('snapshotBuild')?.sum ?? 0) +
      (this.totals.get('briefingBuild')?.sum ?? 0) +
      this.renderMsWindow

    return {
      summaries,
      topBottlenecks,
      totalMs,
      frameCount: this.frameCount,
      mainThreadMs,
      simulationMs,
      renderMs: this.renderMsWindow,
      eventsRetained: this.eventsRetained,
      pixiObjectEstimate: this.pixiObjectEstimate,
      workerMessagesPerSec: this.workerMessagesInWindow / elapsedSec,
      snapshotsPerSec: this.snapshotsInWindow / elapsedSec,
      simTicksPerSec: this.ticksInWindow / elapsedSec,
    }
  }
}

/** Shared profiler instance — safe to use from engine, store, and viewport. */
export const globalProfiler = new PerformanceProfiler()
