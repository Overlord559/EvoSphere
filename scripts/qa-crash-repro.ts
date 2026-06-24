/**
 * Crash reproduction + runaway detection for EvoSphere v0.5.2.
 * Run: npm run qa:crash-repro
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { globalProfiler } from '../src/simulation/engine/performanceProfiler.ts'
import { encodeSnapshot } from '../src/simulation/worker/snapshotCodec.ts'
import { WORKER_SPEED_SCHEDULE } from '../src/simulation/engine/workerSpeedSchedule.ts'
import { tickToYears } from '../src/simulation/engine/simTime.ts'
import {
  MAX_EVENTS_RETAINED,
  RUNAWAY_AGENT_POPULATION,
  RUNAWAY_ORGANISM_POPULATION,
} from '../src/simulation/engine/stabilityGuards.ts'
import { MAX_TOTAL_ORGANISMS } from '../src/types/life.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import type { SimSpeed } from '../src/types/runtime.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const TARGET_YEAR = 10
const TARGET_TICK = TARGET_YEAR * 10
const SAMPLE_EVERY_TICKS = 25 // 0.25 simulated year

interface SampleRow {
  internalTick: number
  simulatedYear: number
  organisms: number
  agents: number
  species: number
  events: number
  snapshotBytesEstimate: number
  lifeTickMs: number
  agentTickMs: number
  stabilityGuardMs: number
  snapshotBuildMs: number
  maxTileOrganisms: number
  maxTileAgents: number
  invalidRemoved: number
  births: number
  deaths: number
  stabilityWarning: string | null
}

interface PhaseResult {
  label: string
  speed: SimSpeed
  ticksRun: number
  elapsedMs: number
  samples: SampleRow[]
  failures: string[]
  pass: boolean
}

function maxOf(arr: number[]): number {
  let m = 0
  for (const v of arr) if (v > m) m = v
  return m
}

function runWorkerLikePhase(speed: SimSpeed, targetTick: number): PhaseResult {
  const engine = new SimEngine({
    seed: SEED,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })

  const schedule = WORKER_SPEED_SCHEDULE[speed as Exclude<SimSpeed, 'deep'>]
  globalProfiler.resetWindow()
  const start = performance.now()
  const samples: SampleRow[] = []
  const failures: string[] = []
  let prevOrganisms = engine.getSnapshot(false).life.totalOrganisms
  let prevAgents = engine.getSnapshot(false).agents.totalAgents
  let prevEvents = 0
  let snapshotBytesPeak = 0
  let tickMsPeak = 0
  let lastSampleTick = 0

  while (engine.getInternalTick() < targetTick) {
    const batchStart = performance.now()
    let batchTicks = 0
    while (
      batchTicks < schedule.batchTicks &&
      performance.now() - batchStart < schedule.maxStepMs &&
      engine.getInternalTick() < targetTick
    ) {
      engine.step(1, false, speed)
      batchTicks += 1
    }

    const snap = engine.getSnapshotWithSelectedSpecies(null, {
      fullBriefing: schedule.fullBriefingEverySnapshot,
      includeOrganisms: false,
      includeAgents: speed === 'normal' || speed === 'fast',
    })
    const encoded = encodeSnapshot(snap, 'render')
    const bytes =
      encoded.payload.tileCounts.byteLength +
      encoded.payload.tileBiomass.byteLength +
      encoded.payload.agentMetaJson.length +
      encoded.payload.briefingJson.length +
      encoded.payload.eventsJson.length
    snapshotBytesPeak = Math.max(snapshotBytesPeak, bytes)

    const report = globalProfiler.buildReport()
    const lifeMs = report.summaries.find((s) => s.category === 'lifeTick')?.avgMs ?? 0
    const agentMs = report.summaries.find((s) => s.category === 'agentTick')?.avgMs ?? 0
    const guardMs = report.summaries.find((s) => s.category === 'stabilityGuards')?.avgMs ?? 0
    const snapMs = report.summaries.find((s) => s.category === 'snapshotBuild')?.avgMs ?? 0
    tickMsPeak = Math.max(tickMsPeak, lifeMs + agentMs)

    const tick = engine.getInternalTick()
    if (tick - lastSampleTick >= SAMPLE_EVERY_TICKS || tick >= targetTick) {
      const lifeSnap = snap.life
      const agentSnap = snap.agents
      const maxTileOrg = maxOf(lifeSnap.tileCounts)
      const maxTileAgent = maxOf(agentSnap.tileAgentCounts)
      const births = Math.max(0, lifeSnap.totalOrganisms - prevOrganisms)
      const deaths = Math.max(0, prevOrganisms - lifeSnap.totalOrganisms)

      samples.push({
        internalTick: tick,
        simulatedYear: tickToYears(tick),
        organisms: lifeSnap.totalOrganisms,
        agents: agentSnap.totalAgents,
        species: lifeSnap.species.filter((s) => s.population > 0).length,
        events: snap.events.length,
        snapshotBytesEstimate: bytes,
        lifeTickMs: lifeMs,
        agentTickMs: agentMs,
        stabilityGuardMs: guardMs,
        snapshotBuildMs: snapMs,
        maxTileOrganisms: maxTileOrg,
        maxTileAgents: maxTileAgent,
        invalidRemoved: 0,
        births,
        deaths,
        stabilityWarning: engine.getStabilityWarning(),
      })

      prevOrganisms = lifeSnap.totalOrganisms
      prevAgents = agentSnap.totalAgents
      prevEvents = snap.events.length
      lastSampleTick = tick
    }

    if (snap.events.length > MAX_EVENTS_RETAINED) {
      failures.push(`events exceeded cap: ${snap.events.length}`)
    }
    if (snap.life.totalOrganisms > RUNAWAY_ORGANISM_POPULATION) {
      failures.push(`organism runaway: ${snap.life.totalOrganisms}`)
    }
    if (snap.agents.totalAgents > RUNAWAY_AGENT_POPULATION) {
      failures.push(`agent runaway: ${snap.agents.totalAgents}`)
    }
    if (snap.life.totalOrganisms > MAX_TOTAL_ORGANISMS) {
      failures.push(`organism hard cap breached: ${snap.life.totalOrganisms}`)
    }
    if (bytes > 8_000_000) {
      failures.push(`snapshot bytes runaway: ${bytes}`)
    }
  }

  if (tickMsPeak > 80) {
    failures.push(`tick time grew high: ${tickMsPeak.toFixed(1)}ms avg peak`)
  }
  if (snapshotBytesPeak > 4_000_000) {
    failures.push(`snapshot size peak high: ${snapshotBytesPeak}`)
  }

  const elapsedMs = performance.now() - start
  const finalSnap = engine.getSnapshot(false)
  if (finalSnap.life.totalOrganisms === prevOrganisms && prevAgents === finalSnap.agents.totalAgents) {
    void prevEvents
  }

  return {
    label: `worker-like ${speed} → yr ${TARGET_YEAR}`,
    speed,
    ticksRun: engine.getInternalTick(),
    elapsedMs,
    samples,
    failures: [...new Set(failures)],
    pass: failures.length === 0,
  }
}

console.log(`EvoSphere crash repro — ${width}×${height}, seed ${SEED}, target year ${TARGET_YEAR}\n`)

const phases: SimSpeed[] = ['normal', 'fast', 'superfast']
const results: PhaseResult[] = []

for (const speed of phases) {
  const result = runWorkerLikePhase(speed, TARGET_TICK)
  results.push(result)
  const status = result.pass ? 'PASS' : 'FAIL'
  console.log(
    `[${status}] ${result.label} — ${result.ticksRun} ticks, ${(result.elapsedMs / 1000).toFixed(1)}s wall`,
  )
  if (result.failures.length) console.log(`  failures: ${result.failures.join('; ')}`)
  const last = result.samples[result.samples.length - 1]
  if (last) {
    console.log(
      `  final: yr ${last.simulatedYear}, org ${last.organisms}, agents ${last.agents}, events ${last.events}, snap ~${last.snapshotBytesEstimate} B`,
    )
  }
}

console.log('\n--- Sample timeline (normal speed, every 0.25 yr) ---')
const normal = results.find((r) => r.speed === 'normal')
if (normal) {
  for (const row of normal.samples) {
    console.log(
      `yr ${row.simulatedYear.toFixed(2)} tick ${row.internalTick}: org ${row.organisms} agents ${row.agents} ` +
        `species ${row.species} events ${row.events} maxTile ${row.maxTileOrganisms} snap ${row.snapshotBytesEstimate}B ` +
        `life ${row.lifeTickMs.toFixed(2)}ms agent ${row.agentTickMs.toFixed(2)}ms`,
    )
  }
}

const allPass = results.every((r) => r.pass)
console.log(`\nQA CRASH REPRO: ${allPass ? 'PASS' : 'FAIL'}`)
process.exit(allPass ? 0 : 1)
