import type { DeepTimeProgress, DeepTimeSummary, ThrottleStatus } from '../../types/runtime'
import type { SimulationSettings, SimulationSnapshot } from '../../types/simulation'
import type { SimSpeed } from '../../types/runtime'
import type { PerformanceReport } from '../engine/performanceProfiler'

/** Snapshot fidelity modes — worker posts compact render snapshots by default. */
export type SnapshotMode = 'render' | 'inspector' | 'full' | 'deepTimeSummary'

export interface WorkerPerformanceMetrics {
  simMsPerBatch: number
  ticksPerBatch: number
  snapshotsPosted: number
  messagesPosted: number
  snapshotsDropped: number
  pendingSnapshots: number
  internalTick: number
  lastSnapshotTick: number
  eventsRetained: number
  throttleStatus: ThrottleStatus
  throttleMessage: string | null
  profile?: PerformanceReport
}

/** Compact render payload — typed arrays transferred zero-copy when possible. */
export interface CompactRenderPayload {
  mode: 'render'
  tick: number
  worldId: string
  renderSnapshotVersion: number
  lastSnapshotTick: number
  /** Tile density arrays (length = width * height). */
  tileCounts: Uint16Array
  tileBiomass: Float32Array
  tileAgentCounts: Uint16Array
  /** Agent positions for glyphs: [x0,y0,x1,y1,...] in tile coords. */
  agentPositions: Float32Array
  /** Packed agent indices parallel to positions — maps into agentMeta. */
  agentSlotIndices: Uint16Array
  /** JSON sidecar for agent metadata (ids, kind, genome refs) — kept small. */
  agentMetaJson: string
  /** Species occupancy tile indices per species id. */
  speciesOccupancyJson: string
  /** Life + agent summary stats. */
  lifeSummaryJson: string
  agentsSummaryJson: string
  briefingJson: string
  eventsJson: string
  lastDeepTimeSummary: DeepTimeSummary | null
  recentActivityTiles: number[]
  stabilityWarning: string | null
}

export interface CompactInspectorPayload {
  mode: 'inspector'
  tick: number
  worldId: string
  renderSnapshotVersion: number
  lastSnapshotTick: number
  tileCounts: Uint16Array
  tileBiomass: Float32Array
  tileAgentCounts: Uint16Array
  agentPositions: Float32Array
  agentSlotIndices: Uint16Array
  agentMetaJson: string
  speciesOccupancyJson: string
  lifeSummaryJson: string
  agentsSummaryJson: string
  briefingJson: string
  eventsJson: string
  lastDeepTimeSummary: DeepTimeSummary | null
  recentActivityTiles: number[]
  stabilityWarning: string | null
  organismsJson: string
  agentsFullJson: string
}

export type CompactSnapshotPayload = CompactRenderPayload | CompactInspectorPayload

/** Main → Worker command messages. */
export type MainToWorkerMessage =
  | { type: 'init'; settings: SimulationSettings; selectedSpeciesId: string | null }
  | { type: 'reset'; settings?: Partial<SimulationSettings>; selectedSpeciesId: string | null }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'setSpeed'; speed: SimSpeed }
  | { type: 'step'; count: number; speed?: SimSpeed }
  | { type: 'requestSnapshot'; mode: SnapshotMode; selectedSpeciesId: string | null }
  | { type: 'setSelectedSpecies'; speciesId: string | null }
  | { type: 'deepTime'; years: number; selectedSpeciesId: string | null }
  | { type: 'cancelDeepTime' }
  | { type: 'injectDisaster'; disasterType: string; severityValue: number }
  | { type: 'injectRandomDisaster' }
  | { type: 'shutdown' }
  | { type: 'snapshotConsumed' }

/** Worker → Main response messages. */
export type WorkerToMainMessage =
  | { type: 'ready' }
  | { type: 'initialized'; worldJson: string; snapshot: CompactSnapshotPayload }
  | { type: 'snapshot'; payload: CompactSnapshotPayload; metrics: WorkerPerformanceMetrics }
  | { type: 'progress'; deepTime: DeepTimeProgress }
  | { type: 'deepTimeComplete'; summary: DeepTimeSummary | null; snapshot: CompactSnapshotPayload; cancelled: boolean }
  | { type: 'metrics'; metrics: WorkerPerformanceMetrics }
  | { type: 'throttle'; status: ThrottleStatus; message: string | null }
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'stepComplete'; metrics: WorkerPerformanceMetrics; snapshot: CompactSnapshotPayload }

export interface WorkerClientCallbacks {
  onSnapshot: (snapshot: SimulationSnapshot, metrics: WorkerPerformanceMetrics | null, recentActivityTiles: number[]) => void
  onInitialized: (snapshot: SimulationSnapshot) => void
  onDeepTimeProgress: (progress: DeepTimeProgress) => void
  onDeepTimeComplete: (summary: DeepTimeSummary | null, snapshot: SimulationSnapshot, cancelled: boolean) => void
  onError: (message: string, fatal: boolean) => void
  onReady: () => void
}

export interface DecodedSnapshotContext {
  cachedWorld: import('../../types/simulation').World
}
