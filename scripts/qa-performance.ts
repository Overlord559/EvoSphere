/**
 * Performance regression benchmarks for EvoSphere v0.5.1 worker architecture.
 * Run: npm run qa:performance
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { globalProfiler } from '../src/simulation/engine/performanceProfiler.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { SPEED_SCHEDULE, ticksForBudget } from '../src/simulation/engine/simScheduler.ts'
import { WORKER_SPEED_SCHEDULE } from '../src/simulation/engine/workerSpeedSchedule.ts'
import { encodeSnapshot } from '../src/simulation/worker/snapshotCodec.ts'
import type { SimSpeed } from '../src/types/runtime.ts'

const SEED = 'evosphere-prime'

interface BenchResult {
  label: string
  speed: SimSpeed
  worldSize: string
  targetSeconds: number
  ticksRun: number
  elapsedMs: number
  snapshotsBuilt: number
  avgSnapshotMs: number
  simTicksPerSec: number
  topBottleneck: string
  finalAgents: number
  finalOrganisms: number
  eventsRetained: number
  pass: boolean
}

function runMainThreadPhase(
  speed: SimSpeed,
  preset: typeof DEFAULT_WORLD_SIZE_PRESET,
  targetSeconds: number,
  fps = 60,
): BenchResult {
  const { width, height } = dimensionsForPreset(preset)
  const engine = new SimEngine({
    seed: SEED,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: preset,
  })

  const schedule = SPEED_SCHEDULE[speed]
  const targetFrames = targetSeconds * fps
  let ticksRun = 0
  let snapshotsBuilt = 0
  let snapshotMsTotal = 0
  let avgMsPerTick = 2
  globalProfiler.resetWindow()
  const start = performance.now()

  for (let frame = 0; frame < targetFrames; frame++) {
    const ticks = ticksForBudget(schedule, 12, avgMsPerTick)
    const simMs = engine.step(ticks, false, speed)
    ticksRun += ticks
    if (ticks > 0) avgMsPerTick = simMs / ticks

    const snapStart = performance.now()
    engine.getSnapshotWithSelectedSpecies(null, {
      fullBriefing: schedule.fullBriefingEverySnapshot,
      includeOrganisms: speed === 'normal' || speed === 'fast',
      includeAgents: true,
    })
    snapshotMsTotal += performance.now() - snapStart
    snapshotsBuilt += 1
    globalProfiler.recordFrame(ticks, true, false)
  }

  const snap = engine.getSnapshot(false)
  const report = globalProfiler.buildReport()
  const elapsedMs = performance.now() - start

  return {
    label: `main ${speed}`,
    speed,
    worldSize: `${width}×${height}`,
    targetSeconds,
    ticksRun,
    elapsedMs,
    snapshotsBuilt,
    avgSnapshotMs: snapshotsBuilt > 0 ? snapshotMsTotal / snapshotsBuilt : 0,
    simTicksPerSec: ticksRun / (elapsedMs / 1000),
    topBottleneck: report.topBottlenecks[0]?.category ?? 'none',
    finalAgents: snap.agents.totalAgents,
    finalOrganisms: snap.life.totalOrganisms,
    eventsRetained: snap.events.length,
    pass: snap.events.length <= 200 && snap.agents.totalAgents <= 800,
  }
}

function runWorkerSimPhase(
  speed: SimSpeed,
  preset: typeof DEFAULT_WORLD_SIZE_PRESET,
  targetSeconds: number,
): BenchResult {
  const { width, height } = dimensionsForPreset(preset)
  const engine = new SimEngine({
    seed: SEED,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: preset,
  })

  const schedule = WORKER_SPEED_SCHEDULE[speed]
  globalProfiler.resetWindow()
  const start = performance.now()
  let ticksRun = 0
  let snapshotsBuilt = 0
  let snapshotMsTotal = 0
  const endAt = start + targetSeconds * 1000

  while (performance.now() < endAt) {
    const batchStart = performance.now()
    let batchTicks = 0
    while (batchTicks < schedule.batchTicks && performance.now() - batchStart < schedule.maxStepMs) {
      engine.step(1, false, speed)
      batchTicks += 1
      ticksRun += 1
    }

    const snap = engine.getSnapshotWithSelectedSpecies(null, {
      fullBriefing: schedule.fullBriefingEverySnapshot,
      includeOrganisms: false,
      includeAgents: speed === 'normal' || speed === 'fast',
    })
    const encStart = performance.now()
    encodeSnapshot(snap, 'render')
    snapshotMsTotal += performance.now() - encStart
    snapshotsBuilt += 1
    globalProfiler.recordFrame(batchTicks, true, true)
  }

  const snap = engine.getSnapshot(false)
  const report = globalProfiler.buildReport()
  const elapsedMs = performance.now() - start

  return {
    label: `worker-sim ${speed}`,
    speed,
    worldSize: `${width}×${height}`,
    targetSeconds,
    ticksRun,
    elapsedMs,
    snapshotsBuilt,
    avgSnapshotMs: snapshotsBuilt > 0 ? snapshotMsTotal / snapshotsBuilt : 0,
    simTicksPerSec: ticksRun / (elapsedMs / 1000),
    topBottleneck: report.topBottlenecks[0]?.category ?? 'none',
    finalAgents: snap.agents.totalAgents,
    finalOrganisms: snap.life.totalOrganisms,
    eventsRetained: snap.events.length,
    pass: snap.events.length <= 200,
  }
}

function printResult(r: BenchResult): void {
  const status = r.pass ? 'PASS' : 'FAIL'
  console.log(
    `[${status}] ${r.label} ${r.worldSize} × ${r.targetSeconds}s — ${r.ticksRun} ticks (${r.simTicksPerSec.toFixed(0)}/s), ` +
      `${r.snapshotsBuilt} snapshots (avg ${r.avgSnapshotMs.toFixed(2)}ms), ` +
      `bottleneck: ${r.topBottleneck}, agents ${r.finalAgents}, events ${r.eventsRetained}, wall ${(r.elapsedMs / 1000).toFixed(1)}s`,
  )
}

console.log(`EvoSphere performance QA — seed ${SEED}\n`)

const results: BenchResult[] = []

for (const phase of [
  { speed: 'normal' as SimSpeed, seconds: 30 },
  { speed: 'fast' as SimSpeed, seconds: 30 },
  { speed: 'superfast' as SimSpeed, seconds: 60 },
  { speed: 'ultrafast' as SimSpeed, seconds: 60 },
]) {
  const main = runMainThreadPhase(phase.speed, DEFAULT_WORLD_SIZE_PRESET, phase.seconds)
  results.push(main)
  printResult(main)

  const worker = runWorkerSimPhase(phase.speed, DEFAULT_WORLD_SIZE_PRESET, phase.seconds)
  results.push(worker)
  printResult(worker)
}

const large = runWorkerSimPhase('superfast', 'large', 30)
results.push(large)
printResult(large)

const deepEngine = new SimEngine({
  seed: SEED,
  ...dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET),
  worldWidth: dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET).width,
  worldHeight: dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET).height,
  tickRate: 10,
  worldSizePreset: DEFAULT_WORLD_SIZE_PRESET,
})
const deep1k = deepEngine.runDeepTimeYears(1000)
console.log(`\nDeep time +1K yr: ${deep1k.runtimeSeconds.toFixed(1)}s`)

const deepEngine2 = new SimEngine({
  seed: SEED,
  worldWidth: dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET).width,
  worldHeight: dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET).height,
  tickRate: 10,
  worldSizePreset: DEFAULT_WORLD_SIZE_PRESET,
})
console.log('Deep time +10K yr (starting — may take minutes)...')
const deep10k = deepEngine2.runDeepTimeYears(10_000)
console.log(`Deep time +10K yr: ${deep10k.runtimeSeconds.toFixed(1)}s`)

const profilingReport = globalProfiler.buildReport()
console.log('\n--- Profiling summary (last window) ---')
console.log(`Top bottlenecks: ${profilingReport.topBottlenecks.map((b) => `${b.category} (${b.pctOfTotal.toFixed(0)}%)`).join(', ')}`)
console.log(`Sim vs render vs main: ${profilingReport.simulationMs.toFixed(0)} / ${profilingReport.renderMs.toFixed(0)} / ${profilingReport.mainThreadMs.toFixed(0)} ms`)
console.log(`Recommended order: ${profilingReport.topBottlenecks.map((b) => b.category).join(' → ')}`)

const allPass = results.every((r) => r.pass)
console.log(`\nQA PERFORMANCE: ${allPass ? 'PASS' : 'FAIL'}`)
process.exit(allPass ? 0 : 1)
