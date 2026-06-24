/**
 * Web Worker entry — owns SimEngine, stepping, deep time, and compact snapshot posting.
 */
import { SimEngine, DEEP_TIME_CHUNK_SIZE, DEEP_TIME_UI_SYNC_MS } from '../engine/SimEngine'
import { globalProfiler, type PerformanceReport } from '../engine/performanceProfiler'
import {
  WORKER_SPEED_SCHEDULE,
  workerShouldPostSnapshot,
} from '../engine/workerSpeedSchedule'
import { MAX_WORKER_SNAPSHOTS_PER_SEC } from '../engine/stabilityGuards'
import { tickToYears, yearsToTicks } from '../engine/simTime'
import type { SimSpeed, ThrottleStatus, DeepTimeProgress } from '../../types/runtime'
import { encodeSnapshot, worldToJson } from './snapshotCodec'
import { isWorkerMessage, workerErrorMessage } from './workerProtocol'
import type {
  MainToWorkerMessage,
  WorkerPerformanceMetrics,
  WorkerToMainMessage,
  SnapshotMode,
} from './workerTypes'

let engine: SimEngine | null = null
let running = false
let speed: SimSpeed = 'normal'
let selectedSpeciesId: string | null = null
let loopTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapshotMs = 0
let lastSnapshotTick = 0
let snapshotsPosted = 0
let messagesPosted = 0
let snapshotsDropped = 0
let pendingOnMain = 0
let snapshotWindowStart = performance.now()
let snapshotsInWindow = 0
let deepTimeCancel = false
let deepTimeRunning = false

function post(message: WorkerToMainMessage, transfer?: Transferable[]): void {
  messagesPosted += 1
  const port = self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }
  if (transfer && transfer.length > 0) {
    port.postMessage(message, transfer)
  } else {
    port.postMessage(message)
  }
}

function requireEngine(): SimEngine {
  if (!engine) throw new Error('SimEngine not initialized')
  return engine
}

function buildMetrics(
  simMs: number,
  ticks: number,
  throttleStatus: ThrottleStatus,
  throttleMessage: string | null,
): WorkerPerformanceMetrics {
  const eng = requireEngine()
  const snap = eng.getSnapshot(false)
  return {
    simMsPerBatch: simMs,
    ticksPerBatch: ticks,
    snapshotsPosted,
    messagesPosted,
    snapshotsDropped,
    pendingSnapshots: pendingOnMain,
    internalTick: eng.getInternalTick(),
    lastSnapshotTick: eng.getLastSnapshotTick(),
    eventsRetained: snap.events.length,
    throttleStatus,
    throttleMessage,
    profile: globalProfiler.buildReport(),
  }
}

function deriveThrottle(stabilityWarning: string | null, simMs: number, scheduleTicks: number, actualTicks: number): {
  status: ThrottleStatus
  message: string | null
} {
  if (stabilityWarning) return { status: 'overloaded', message: stabilityWarning }
  if (actualTicks < scheduleTicks * 0.5 && scheduleTicks > 4) {
    return { status: 'throttled', message: 'Worker-side time budget — batch reduced' }
  }
  if (simMs > scheduleTicks * 3) {
    return { status: 'catching_up', message: 'Worker catching up — snapshot throttled' }
  }
  return { status: 'ok', message: null }
}

function canPostSnapshotNow(): boolean {
  const now = performance.now()
  if (now - snapshotWindowStart >= 1000) {
    snapshotWindowStart = now
    snapshotsInWindow = 0
  }
  if (pendingOnMain >= 2) return false
  if (snapshotsInWindow >= MAX_WORKER_SNAPSHOTS_PER_SEC) return false
  return true
}

function postSnapshot(mode: SnapshotMode, recentActivity: number[]): void {
  if (!canPostSnapshotNow()) {
    snapshotsDropped += 1
    return
  }
  const eng = requireEngine()
  const fullBriefing = mode !== 'render' || WORKER_SPEED_SCHEDULE[speed as Exclude<SimSpeed, 'deep'>]?.fullBriefingEverySnapshot !== false
  const includeOrganisms = mode === 'inspector' || mode === 'full'
  const includeAgents = mode !== 'render' || speed === 'normal' || speed === 'fast'

  const snapshot = globalProfiler.time('snapshotBuild', () =>
    eng.getSnapshotWithSelectedSpecies(selectedSpeciesId, {
      fullBriefing,
      includeOrganisms,
      includeAgents,
    }),
  )

  globalProfiler.time('briefingBuild', () => snapshot.briefing)
  globalProfiler.setEventsRetained(snapshot.events.length)

  const { payload, transfer } = encodeSnapshot(snapshot, mode)
  payload.recentActivityTiles = recentActivity
  payload.stabilityWarning = eng.getStabilityWarning()

  snapshotsPosted += 1
  snapshotsInWindow += 1
  pendingOnMain += 1
  globalProfiler.recordFrame(0, true, true)
  post({ type: 'snapshot', payload, metrics: buildMetrics(0, 0, 'ok', payload.stabilityWarning) }, transfer)
  lastSnapshotMs = performance.now()
  lastSnapshotTick = eng.getLastSnapshotTick()
}

function stopLoop(): void {
  running = false
  if (loopTimer !== null) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
}

function scheduleLoop(): void {
  if (!running || deepTimeRunning) return
  if (speed === 'deep') return

  const schedule = WORKER_SPEED_SCHEDULE[speed as Exclude<SimSpeed, 'deep'>]
  loopTimer = setTimeout(runLoopIteration, schedule.loopIntervalMs)
}

function runLoopIteration(): void {
  loopTimer = null
  if (!running || !engine || deepTimeRunning || speed === 'deep') return

  const schedule = WORKER_SPEED_SCHEDULE[speed as Exclude<SimSpeed, 'deep'>]
  const batchStart = performance.now()
  let ticksRun = 0
  let simMs = 0

  while (ticksRun < schedule.batchTicks && performance.now() - batchStart < schedule.maxStepMs) {
    simMs += engine!.step(1, false, speed)
    ticksRun += 1
  }

  globalProfiler.recordFrame(ticksRun, false, false)

  const eng = requireEngine()
  const internalTick = eng.getInternalTick()
  const msSinceSnapshot = performance.now() - lastSnapshotMs
  const stabilityWarning = eng.getStabilityWarning()
  const throttle = deriveThrottle(stabilityWarning, simMs, schedule.batchTicks, ticksRun)

  if (
    workerShouldPostSnapshot(schedule, internalTick, lastSnapshotTick, msSinceSnapshot)
  ) {
    postSnapshot('render', eng.getRecentActivityTileIndices())
  } else {
    post({
      type: 'metrics',
      metrics: buildMetrics(simMs, ticksRun, throttle.status, throttle.message),
    })
  }

  if (running) scheduleLoop()
}

async function runDeepTime(years: number, speciesId: string | null): Promise<void> {
  const eng = requireEngine()
  deepTimeRunning = true
  deepTimeCancel = false
  stopLoop()

  const totalTicks = yearsToTicks(years)
  const startYear = tickToYears(eng.getInternalTick())
  const targetYear = startYear + years
  const runtimeStart = performance.now()
  const capture = eng.startDeepTimeCapture(speciesId)

  let remaining = totalTicks
  let chunkIndex = 0

  while (remaining > 0 && !deepTimeCancel) {
    const chunk = Math.min(remaining, DEEP_TIME_CHUNK_SIZE)
    eng.stepDeepTimeBatch(chunk)
    remaining -= chunk
    chunkIndex += 1

    const completedTicks = totalTicks - remaining
    const elapsedMs = performance.now() - runtimeStart
    const currentYear = startYear + Math.floor(completedTicks / 10)
    const rate = completedTicks > 0 ? elapsedMs / completedTicks : 0

    const progress: DeepTimeProgress = {
      completedTicks,
      totalTicks,
      startYear,
      targetYear,
      currentYear,
      elapsedMs,
      mode: 'exact',
      estimatedRemainingMs: rate > 0 ? Math.round(rate * remaining) : null,
    }

    post({ type: 'progress', deepTime: progress })

    if (chunkIndex % 2 === 0 || remaining === 0) {
      postSnapshot('render', eng.getRecentActivityTileIndices())
    }

    if (elapsedMs > DEEP_TIME_UI_SYNC_MS) {
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }

  const cancelled = deepTimeCancel
  const summary = cancelled ? null : eng.finalizeDeepTime(capture)
  postSnapshot('deepTimeSummary' as SnapshotMode, eng.getRecentActivityTileIndices())
  const { payload, transfer } = encodeSnapshot(
    eng.getSnapshotWithSelectedSpecies(speciesId, { fullBriefing: true, includeOrganisms: true, includeAgents: true }),
    'full',
  )
  post(
    { type: 'deepTimeComplete', summary, snapshot: payload, cancelled },
    transfer,
  )

  deepTimeRunning = false
  if (running) scheduleLoop()
}

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  if (!isWorkerMessage(event.data) && !('type' in event.data)) {
    return
  }

  const msg = event.data
  try {
    switch (msg.type) {
      case 'init': {
        engine = new SimEngine({ ...msg.settings })
        selectedSpeciesId = msg.selectedSpeciesId
        lastSnapshotMs = performance.now()
        lastSnapshotTick = engine.getLastSnapshotTick()
        snapshotsPosted = 0
        messagesPosted = 0
        snapshotsDropped = 0
        pendingOnMain = 0
        snapshotsInWindow = 0
        snapshotWindowStart = performance.now()
        globalProfiler.resetWindow()
        const snap = engine.getSnapshotWithSelectedSpecies(selectedSpeciesId, { fullBriefing: true })
        const { payload, transfer } = encodeSnapshot(snap, 'full')
        post({ type: 'initialized', worldJson: worldToJson(snap.world), snapshot: payload }, transfer)
        post({ type: 'ready' })
        break
      }

      case 'reset': {
        const eng = requireEngine()
        selectedSpeciesId = msg.selectedSpeciesId
        eng.reset(msg.settings)
        selectedSpeciesId = msg.selectedSpeciesId
        lastSnapshotTick = eng.getLastSnapshotTick()
        globalProfiler.resetWindow()
        const snap = eng.getSnapshotWithSelectedSpecies(selectedSpeciesId, { fullBriefing: true })
        const { payload, transfer } = encodeSnapshot(snap, 'full')
        post({ type: 'initialized', worldJson: worldToJson(snap.world), snapshot: payload }, transfer)
        break
      }

      case 'play':
        running = true
        scheduleLoop()
        break

      case 'pause':
        stopLoop()
        break

      case 'setSpeed':
        speed = msg.speed
        break

      case 'setSelectedSpecies':
        selectedSpeciesId = msg.speciesId
        break

      case 'step': {
        const eng = requireEngine()
        const stepSpeed = msg.speed ?? 'normal'
        const simMs = eng.step(msg.count, false, stepSpeed)
        const { payload, transfer } = encodeSnapshot(
          eng.getSnapshotWithSelectedSpecies(selectedSpeciesId, { fullBriefing: true }),
          'inspector',
        )
        post(
          {
            type: 'stepComplete',
            metrics: buildMetrics(simMs, msg.count, 'ok', eng.getStabilityWarning()),
            snapshot: payload,
          },
          transfer,
        )
        break
      }

      case 'requestSnapshot': {
        postSnapshot(msg.mode, requireEngine().getRecentActivityTileIndices())
        break
      }

      case 'deepTime':
        void runDeepTime(msg.years, msg.selectedSpeciesId)
        break

      case 'cancelDeepTime':
        deepTimeCancel = true
        break

      case 'injectDisaster': {
        const eng = requireEngine()
        eng.injectDisaster(msg.disasterType as import('../disasters/DisasterTypes').DisasterType, msg.severityValue)
        postSnapshot('render', eng.getRecentActivityTileIndices())
        break
      }

      case 'injectRandomDisaster': {
        const eng = requireEngine()
        eng.injectRandomDisaster()
        postSnapshot('render', eng.getRecentActivityTileIndices())
        break
      }

      case 'shutdown':
        stopLoop()
        engine = null
        break

      case 'snapshotConsumed':
        pendingOnMain = Math.max(0, pendingOnMain - 1)
        break

      default:
        break
    }
  } catch (err) {
    post({ type: 'error', message: workerErrorMessage(err), fatal: false })
  }
}

export type { PerformanceReport }
