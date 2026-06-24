/** Feature flags for simulation runtime architecture. */

/** When true, simulation runs in a Web Worker; main thread renders only. */
export const WORKER_SIMULATION_ENABLED = true

/** Snapshot mode defaults per speed (worker + main). */
export const DEFAULT_SNAPSHOT_MODE = 'render' as const

export {
  MAX_PENDING_SNAPSHOTS,
  MAX_WORKER_SNAPSHOTS_PER_SEC,
} from '../engine/stabilityGuards'
