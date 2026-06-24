/**
 * Long-run headless soak for EvoSphere v0.5.2b.
 * Run: npm run qa:longrun
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { globalProfiler } from '../src/simulation/engine/performanceProfiler.ts'
import { WORKER_SPEED_SCHEDULE } from '../src/simulation/engine/workerSpeedSchedule.ts'
import { tickToYears } from '../src/simulation/engine/simTime.ts'
import {
  MAX_DEVELOPMENTS_RETAINED,
  MAX_EVENTS_RETAINED,
  MAX_SPECIES_POP_HISTORY,
  RUNAWAY_AGENT_POPULATION,
  RUNAWAY_ORGANISM_POPULATION,
} from '../src/simulation/engine/stabilityGuards.ts'
import { MAX_TOTAL_ORGANISMS } from '../src/types/life.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import type { SimSpeed } from '../src/types/runtime.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const TARGET_YEAR = 25
const TARGET_TICK = TARGET_YEAR * 10
const REPORT_EVERY_YEARS = 5

interface YearRow {
  year: number
  tick: number
  organisms: number
  agents: number
  species: number
  events: number
  developments: number
  maxTileOrg: number
  maxTileAgent: number
  invalidReason: string | null
}

interface SoakPhase {
  speed: SimSpeed
  label: string
  targetTick: number
}

function maxOf(arr: number[]): number {
  let m = 0
  for (const v of arr) if (v > m) m = v
  return m
}

function validateSnapshot(
  snap: ReturnType<SimEngine['getSnapshotWithSelectedSpecies']>,
  engine: SimEngine,
): string | null {
  if (snap.events.length > MAX_EVENTS_RETAINED) return `events cap ${snap.events.length}`
  if (snap.briefing.latestDevelopments.length > MAX_DEVELOPMENTS_RETAINED) {
    return `developments cap ${snap.briefing.latestDevelopments.length}`
  }
  if (snap.life.totalOrganisms > RUNAWAY_ORGANISM_POPULATION) return `organism runaway ${snap.life.totalOrganisms}`
  if (snap.agents.totalAgents > RUNAWAY_AGENT_POPULATION) return `agent runaway ${snap.agents.totalAgents}`
  if (snap.life.totalOrganisms > MAX_TOTAL_ORGANISMS) return `hard org cap ${snap.life.totalOrganisms}`
  if (engine.getStabilityWarning()) return engine.getStabilityWarning()
  for (const agent of snap.agents.agents.slice(0, 30)) {
    if (!Number.isFinite(agent.energy) || !agent.bodyPlan) return 'invalid agent'
  }
  return null
}

function runSoak(phase: SoakPhase): { rows: YearRow[]; failures: string[]; elapsedMs: number; finalTick: number } {
  const engine = new SimEngine({
    seed: SEED,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })

  const schedule = WORKER_SPEED_SCHEDULE[phase.speed as Exclude<SimSpeed, 'deep'>]
  globalProfiler.resetWindow()
  const start = performance.now()
  const rows: YearRow[] = []
  const failures: string[] = []
  let lastReportYear = -1
  let prevOrg = engine.getSnapshot(false).life.totalOrganisms

  while (engine.getInternalTick() < phase.targetTick) {
    const batchStart = performance.now()
    let batchTicks = 0
    while (
      batchTicks < schedule.batchTicks &&
      performance.now() - batchStart < schedule.maxStepMs &&
      engine.getInternalTick() < phase.targetTick
    ) {
      engine.step(1, false, phase.speed)
      batchTicks += 1
    }

    const tick = engine.getInternalTick()
    const year = tickToYears(tick)
    const snap = engine.getSnapshotWithSelectedSpecies(null, {
      fullBriefing: schedule.fullBriefingEverySnapshot,
      includeOrganisms: false,
      includeAgents: phase.speed === 'normal' || phase.speed === 'fast',
    })

    const invalid = validateSnapshot(snap, engine)
    if (invalid) failures.push(`yr ${year}: ${invalid}`)

    const org = snap.life.totalOrganisms
    const birthDeathDelta = Math.abs(org - prevOrg)
    if (birthDeathDelta > 800 && year > 5) {
      failures.push(`yr ${year}: population jump ${birthDeathDelta} in batch window`)
    }
    prevOrg = org

    const reportYear = Math.floor(year / REPORT_EVERY_YEARS) * REPORT_EVERY_YEARS
    if (reportYear > lastReportYear && year >= reportYear) {
      lastReportYear = reportYear
      rows.push({
        year: reportYear,
        tick,
        organisms: org,
        agents: snap.agents.totalAgents,
        species: snap.life.species.filter((s) => s.population > 0).length,
        events: snap.events.length,
        developments: snap.briefing.latestDevelopments.length,
        maxTileOrg: maxOf(snap.life.tileCounts),
        maxTileAgent: maxOf(snap.agents.tileAgentCounts),
        invalidReason: invalid,
      })
    }
  }

  const popHistory = engine.getSnapshot(false).life
  void popHistory
  void MAX_SPECIES_POP_HISTORY

  return {
    rows,
    failures: [...new Set(failures)],
    elapsedMs: performance.now() - start,
    finalTick: engine.getInternalTick(),
  }
}

console.log(`EvoSphere long-run QA — ${width}×${height}, seed ${SEED}, target yr ${TARGET_YEAR}\n`)

const phases: SoakPhase[] = [
  { speed: 'normal', label: 'Normal → yr 25', targetTick: TARGET_TICK },
  { speed: 'fast', label: 'Fast soak (yr 10 window)', targetTick: 100 },
  { speed: 'superfast', label: 'Super Fast soak (yr 5 window)', targetTick: 50 },
  { speed: 'ultrafast', label: 'Ultra Fast soak (yr 2 window)', targetTick: 20 },
]

let allPass = true

for (const phase of phases) {
  const result = runSoak(phase)
  const pass = result.failures.length === 0
  allPass = allPass && pass
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${phase.label} — tick ${result.finalTick}, ${(result.elapsedMs / 1000).toFixed(1)}s`)
  if (result.failures.length) console.log(`  failures: ${result.failures.slice(0, 5).join('; ')}`)
  if (phase.speed === 'normal') {
    console.log('\n--- Normal speed table (every 5 simulated years) ---')
    console.log('year | org | agents | species | events | dev | maxTile')
    for (const row of result.rows) {
      console.log(
        `${row.year.toString().padStart(4)} | ${String(row.organisms).padStart(4)} | ${String(row.agents).padStart(6)} | ${String(row.species).padStart(7)} | ${String(row.events).padStart(6)} | ${String(row.developments).padStart(3)} | ${row.maxTileOrg}/${row.maxTileAgent}`,
      )
    }
    console.log('')
  }
}

console.log(`\nBrowser-only checks (manual): Pixi gfx stable, RAF=1, worker=1, pending snap ≤2, heap trend flat`)
console.log(`QA LONGRUN: ${allPass ? 'PASS' : 'FAIL'}`)
process.exit(allPass ? 0 : 1)
