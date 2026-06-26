import type { DeepTimeProgress, DeepTimeSummary, SimSpeed, ThrottleStatus } from '../../types/runtime'
import type { SimulationSettings, World } from '../../types/simulation'
import type { DisasterSettings } from '../config/disasterConfig'
import type { EraDirectorSettings } from '../era/eraTypes'
import type { EraPresetDefinition } from '../../ui/showcase/eraPresets'
import { MAX_PENDING_SNAPSHOTS, WORKER_SIMULATION_ENABLED } from '../config/simConfig'
import { decodeSnapshot, cloneWorldFromJson } from './snapshotCodec'
import { postToWorker, workerErrorMessage } from './workerProtocol'
import type {
  MainToWorkerMessage,
  WorkerClientCallbacks,
  WorkerPerformanceMetrics,
  WorkerToMainMessage,
  SnapshotMode,
} from './workerTypes'
import { registerWorkerInstance, unregisterWorkerInstance } from '../../ui/viewport/lifecycleGuards'

export type WorkerSimulationState = 'idle' | 'loading' | 'ready' | 'error' | 'terminated'

interface QueuedSnapshot {
  payload: WorkerToMainMessage & { type: 'snapshot' | 'stepComplete' }
  metrics: WorkerPerformanceMetrics | null
  recentActivityTiles: number[]
}

export class WorkerSimulationClient {
  private worker: Worker | null = null
  private callbacks: WorkerClientCallbacks
  private state: WorkerSimulationState = 'idle'
  private cachedWorld: World | null = null
  private selectedSpeciesId: string | null = null
  private fatalError = false
  private snapshotsDropped = 0
  private snapshotQueue: QueuedSnapshot[] = []
  private draining = false

  constructor(callbacks: WorkerClientCallbacks) {
    this.callbacks = callbacks
  }

  getState(): WorkerSimulationState {
    return this.state
  }

  isReady(): boolean {
    return this.state === 'ready' && !this.fatalError
  }

  getCachedWorld(): World | null {
    return this.cachedWorld
  }

  getPendingSnapshots(): number {
    return this.snapshotQueue.length + (this.draining ? 1 : 0)
  }

  getSnapshotsDropped(): number {
    return this.snapshotsDropped
  }

  async start(settings: SimulationSettings, selectedSpeciesId: string | null): Promise<void> {
    this.selectedSpeciesId = selectedSpeciesId
    this.state = 'loading'
    this.fatalError = false
    this.snapshotsDropped = 0
    this.snapshotQueue = []
    this.draining = false

    try {
      this.worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })
      registerWorkerInstance()
      this.worker.onmessage = (event) => this.handleMessage(event.data)
      this.worker.onerror = (event) => {
        this.fatalError = true
        this.state = 'error'
        this.callbacks.onError(event.message || 'Worker error', true)
      }

      await this.sendAndWaitForInit({ type: 'init', settings, selectedSpeciesId })
    } catch (err) {
      this.fatalError = true
      this.state = 'error'
      this.callbacks.onError(workerErrorMessage(err), true)
      throw err
    }
  }

  private sendAndWaitForInit(message: MainToWorkerMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = this.worker
      if (!worker) {
        reject(new Error('Worker not created'))
        return
      }

      const onMessage = (event: MessageEvent<WorkerToMainMessage>) => {
        const data = event.data
        if (data.type === 'initialized') {
          this.cachedWorld = cloneWorldFromJson(data.worldJson)
          const snapshot = decodeSnapshot(data.snapshot, this.cachedWorld!)
          this.callbacks.onInitialized(snapshot)
        } else if (data.type === 'ready') {
          this.state = 'ready'
          this.callbacks.onReady()
          worker.removeEventListener('message', onMessage)
          resolve()
        } else if (data.type === 'error' && data.fatal) {
          worker.removeEventListener('message', onMessage)
          reject(new Error(data.message))
        }
      }

      worker.addEventListener('message', onMessage)
      postToWorker(worker, message)
    })
  }

  private handleMessage(data: WorkerToMainMessage): void {
    if (!this.cachedWorld) return

    switch (data.type) {
      case 'initialized': {
        this.cachedWorld = cloneWorldFromJson(data.worldJson)
        const snapshot = decodeSnapshot(data.snapshot, this.cachedWorld)
        this.callbacks.onInitialized(snapshot)
        break
      }
      case 'snapshot':
        this.enqueueSnapshot(data, data.metrics, data.payload.recentActivityTiles)
        break
      case 'stepComplete':
        this.enqueueSnapshot(data, data.metrics, data.snapshot.recentActivityTiles)
        break
      case 'progress':
        this.callbacks.onDeepTimeProgress(data.deepTime)
        break
      case 'deepTimeComplete': {
        const snapshot = decodeSnapshot(data.snapshot, this.cachedWorld)
        this.callbacks.onDeepTimeComplete(data.summary, snapshot, data.cancelled)
        this.send({ type: 'snapshotConsumed' })
        break
      }
      case 'metrics':
        break
      case 'error':
        this.callbacks.onError(data.message, data.fatal)
        if (data.fatal) this.fatalError = true
        break
      default:
        break
    }
  }

  private enqueueSnapshot(
    payload: QueuedSnapshot['payload'],
    metrics: WorkerPerformanceMetrics | null,
    recentActivityTiles: number[],
  ): void {
    const queued: QueuedSnapshot = { payload, metrics, recentActivityTiles }

    if (this.snapshotQueue.length >= MAX_PENDING_SNAPSHOTS) {
      this.snapshotQueue[this.snapshotQueue.length - 1] = queued
      this.snapshotsDropped += 1
      return
    }

    this.snapshotQueue.push(queued)
    this.drainSnapshotQueue()
  }

  private drainSnapshotQueue(): void {
    if (this.draining || this.snapshotQueue.length === 0 || !this.cachedWorld) return
    this.draining = true
    const queued = this.snapshotQueue.shift()!

    requestAnimationFrame(() => {
      if (!this.cachedWorld) {
        this.draining = false
        return
      }

      const { payload, metrics, recentActivityTiles } = queued
      if (payload.type === 'snapshot') {
        const snapshot = decodeSnapshot(payload.payload, this.cachedWorld)
        this.callbacks.onSnapshot(snapshot, metrics, recentActivityTiles)
      } else {
        const snapshot = decodeSnapshot(payload.snapshot, this.cachedWorld)
        this.callbacks.onSnapshot(snapshot, metrics, recentActivityTiles)
      }

      this.send({ type: 'snapshotConsumed' })
      this.draining = false
      this.drainSnapshotQueue()
    })
  }

  private send(message: MainToWorkerMessage): void {
    if (!this.worker) return
    postToWorker(this.worker, message)
  }

  play(): void {
    this.send({ type: 'play' })
  }

  pause(): void {
    this.send({ type: 'pause' })
  }

  setSpeed(speed: SimSpeed): void {
    this.send({ type: 'setSpeed', speed })
  }

  setSelectedSpecies(speciesId: string | null): void {
    this.selectedSpeciesId = speciesId
    this.send({ type: 'setSelectedSpecies', speciesId })
    this.send({ type: 'requestSnapshot', mode: 'render', selectedSpeciesId: speciesId })
  }

  step(count: number, speed: SimSpeed = 'normal'): void {
    this.send({ type: 'step', count, speed })
  }

  reset(settings?: Partial<SimulationSettings>): void {
    this.snapshotQueue = []
    this.draining = false
    this.snapshotsDropped = 0
    this.send({ type: 'reset', settings, selectedSpeciesId: this.selectedSpeciesId })
  }

  requestSnapshot(mode: SnapshotMode = 'render'): void {
    this.send({ type: 'requestSnapshot', mode, selectedSpeciesId: this.selectedSpeciesId })
  }

  runDeepTime(years: number, selectedSpeciesId: string | null): void {
    this.selectedSpeciesId = selectedSpeciesId
    this.send({ type: 'deepTime', years, selectedSpeciesId })
  }

  cancelDeepTime(): void {
    this.send({ type: 'cancelDeepTime' })
  }

  injectDisaster(disasterType: string, severityValue: number): void {
    this.send({ type: 'injectDisaster', disasterType, severityValue })
  }

  injectRandomDisaster(): void {
    this.send({ type: 'injectRandomDisaster' })
  }

  setDisasterSettings(settings: Partial<DisasterSettings>): void {
    this.send({ type: 'setDisasterSettings', settings })
  }

  setEraDirectorSettings(settings: Partial<EraDirectorSettings>): void {
    this.send({ type: 'setEraDirectorSettings', settings })
  }

  applyEraPreset(preset: EraPresetDefinition): void {
    this.send({ type: 'applyEraPreset', preset })
  }

  terminate(): void {
    if (this.worker) {
      this.send({ type: 'shutdown' })
      this.worker.terminate()
      this.worker = null
      unregisterWorkerInstance()
    }
    this.snapshotQueue = []
    this.draining = false
    this.state = 'terminated'
  }
}

export async function tryCreateWorkerClient(
  callbacks: WorkerClientCallbacks,
  settings: SimulationSettings,
  selectedSpeciesId: string | null,
): Promise<WorkerSimulationClient | null> {
  if (!WORKER_SIMULATION_ENABLED || typeof Worker === 'undefined') return null
  const client = new WorkerSimulationClient(callbacks)
  try {
    await client.start(settings, selectedSpeciesId)
    return client
  } catch {
    client.terminate()
    return null
  }
}

export type { WorkerPerformanceMetrics, ThrottleStatus, DeepTimeSummary, DeepTimeProgress }
