import type { SimSpeed } from '../../types/runtime'

/**
 * Worker-side speed schedules — higher throughput than main-thread budgets
 * because simulation no longer competes with React/Pixi on the UI thread.
 */
export interface WorkerSpeedSchedule {
  /** Ticks to run per worker loop iteration. */
  batchTicks: number
  /** Min ms between worker loop iterations (yield to message queue). */
  loopIntervalMs: number
  /** Max ms spent stepping per loop before posting progress. */
  maxStepMs: number
  /** Min ms between render snapshots posted to main. */
  snapshotEveryMs: number
  /** Min internal ticks between snapshots. */
  snapshotEveryTicks: number
  fullBriefingEverySnapshot: boolean
  eventThrottleFactor: number
}

export const WORKER_SPEED_SCHEDULE: Record<Exclude<SimSpeed, 'deep'>, WorkerSpeedSchedule> = {
  normal: {
    batchTicks: 2,
    loopIntervalMs: 16,
    maxStepMs: 12,
    snapshotEveryMs: 50,
    snapshotEveryTicks: 1,
    fullBriefingEverySnapshot: true,
    eventThrottleFactor: 1,
  },
  fast: {
    batchTicks: 24,
    loopIntervalMs: 10,
    maxStepMs: 16,
    snapshotEveryMs: 60,
    snapshotEveryTicks: 6,
    fullBriefingEverySnapshot: true,
    eventThrottleFactor: 2,
  },
  superfast: {
    batchTicks: 80,
    loopIntervalMs: 6,
    maxStepMs: 20,
    snapshotEveryMs: 100,
    snapshotEveryTicks: 32,
    fullBriefingEverySnapshot: false,
    eventThrottleFactor: 4,
  },
  ultrafast: {
    batchTicks: 200,
    loopIntervalMs: 4,
    maxStepMs: 24,
    snapshotEveryMs: 140,
    snapshotEveryTicks: 80,
    fullBriefingEverySnapshot: false,
    eventThrottleFactor: 8,
  },
}

export function workerShouldPostSnapshot(
  schedule: WorkerSpeedSchedule,
  internalTick: number,
  lastSnapshotTick: number,
  msSinceSnapshot: number,
): boolean {
  if (internalTick <= lastSnapshotTick) return false
  if (schedule.snapshotEveryMs > 0 && msSinceSnapshot >= schedule.snapshotEveryMs) return true
  return internalTick - lastSnapshotTick >= schedule.snapshotEveryTicks
}
