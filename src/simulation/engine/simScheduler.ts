import type { SimSpeed } from '../../types/runtime'

/** Max simulation milliseconds budget per animation frame. */
export const SIM_MS_BUDGET_PER_FRAME = 14

/** Hard cap on internal ticks per frame regardless of speed mode. */
export const MAX_TICKS_PER_FRAME = 48

/** Minimum ms between full UI snapshots during fast playback. */
export const MIN_SNAPSHOT_INTERVAL_MS = 50

export interface SpeedSchedule {
  /** Target ticks to attempt per frame (soft cap — time budget may reduce). */
  targetTicksPerFrame: number
  /** Min ticks between full snapshots (internal tick count). */
  snapshotEveryTicks: number
  /** Min ms between full snapshots. */
  snapshotEveryMs: number
  /** Whether briefing/developments rebuild on every snapshot. */
  fullBriefingEverySnapshot: boolean
  /** Event emission throttle factor (1 = normal, higher = less frequent). */
  eventThrottleFactor: number
}

export const SPEED_SCHEDULE: Record<Exclude<SimSpeed, 'deep'>, SpeedSchedule> = {
  normal: {
    targetTicksPerFrame: 1,
    snapshotEveryTicks: 1,
    snapshotEveryMs: 0,
    fullBriefingEverySnapshot: true,
    eventThrottleFactor: 1,
  },
  fast: {
    targetTicksPerFrame: 8,
    snapshotEveryTicks: 2,
    snapshotEveryMs: 60,
    fullBriefingEverySnapshot: true,
    eventThrottleFactor: 2,
  },
  superfast: {
    targetTicksPerFrame: 20,
    snapshotEveryTicks: 8,
    snapshotEveryMs: 100,
    fullBriefingEverySnapshot: false,
    eventThrottleFactor: 4,
  },
  ultrafast: {
    targetTicksPerFrame: 40,
    snapshotEveryTicks: 16,
    snapshotEveryMs: 140,
    fullBriefingEverySnapshot: false,
    eventThrottleFactor: 8,
  },
}

export function ticksForBudget(
  schedule: SpeedSchedule,
  elapsedMs: number,
  avgMsPerTick: number,
): number {
  const target = schedule.targetTicksPerFrame
  if (avgMsPerTick <= 0) return Math.min(target, MAX_TICKS_PER_FRAME)

  const budgetTicks = Math.floor(SIM_MS_BUDGET_PER_FRAME / avgMsPerTick)
  if (elapsedMs > SIM_MS_BUDGET_PER_FRAME * 1.5) {
    return Math.max(1, Math.min(2, budgetTicks, MAX_TICKS_PER_FRAME))
  }
  return Math.max(1, Math.min(target, budgetTicks, MAX_TICKS_PER_FRAME))
}

export function shouldRefreshSnapshot(
  schedule: SpeedSchedule,
  internalTick: number,
  lastSnapshotTick: number,
  msSinceSnapshot: number,
): boolean {
  if (internalTick <= lastSnapshotTick) return false
  if (schedule.snapshotEveryMs > 0 && msSinceSnapshot >= schedule.snapshotEveryMs) return true
  return internalTick - lastSnapshotTick >= schedule.snapshotEveryTicks
}
