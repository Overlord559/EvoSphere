/**
 * Headless stability regression for EvoSphere v0.5 QA gate.
 * Run: npx tsx scripts/qa-stability.ts
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { SPEED_SCHEDULE, ticksForBudget } from '../src/simulation/engine/simScheduler.ts'
import type { SimSpeed } from '../src/types/runtime.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)

interface PhaseResult {
  speed: SimSpeed
  label: string
  targetSeconds: number
  ticksRun: number
  elapsedMs: number
  finalAgents: number
  finalOrganisms: number
  eventCount: number
  stabilityWarning: string | null
  pass: boolean
  notes: string[]
}

function runPhase(speed: SimSpeed, targetSeconds: number, fps = 60): PhaseResult {
  const engine = new SimEngine({
    seed: SEED,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })

  const schedule = SPEED_SCHEDULE[speed]
  const targetFrames = targetSeconds * fps
  let ticksRun = 0
  let avgMsPerTick = 2
  const start = performance.now()

  for (let frame = 0; frame < targetFrames; frame++) {
    const ticks = ticksForBudget(schedule, 12, avgMsPerTick)
    const simMs = engine.step(ticks, false, speed)
    ticksRun += ticks
    if (ticks > 0) avgMsPerTick = simMs / ticks
    const frameBudgetMs = 16
    const _elapsedFrame = Math.min(frameBudgetMs, simMs)
    void _elapsedFrame
  }

  const snap = engine.getSnapshot(false)
  const elapsedMs = performance.now() - start
  const notes: string[] = []
  let pass = true

  if (snap.events.length > 200) {
    pass = false
    notes.push(`event log exceeded cap: ${snap.events.length}`)
  }
  if (snap.agents.totalAgents > 1200) {
    pass = false
    notes.push(`tracked agent safety exceeded: ${snap.agents.totalAgents}`)
  }
  if (snap.life.totalOrganisms > 12000) {
    pass = false
    notes.push(`tracked organism safety exceeded: ${snap.life.totalOrganisms}`)
  }
  const bioPop = snap.life.totalBiologicalPopulation + snap.agents.totalMobilePopulation
  const units = snap.life.representationMetrics?.populationUnitsCount ?? 0
  if (units > 2500 || !Number.isFinite(bioPop)) {
    pass = false
    notes.push(`runaway representation records: ${units} units`)
  }
  if (bioPop > 0 && !Number.isFinite(bioPop)) {
    pass = false
    notes.push(`invalid biological population: ${bioPop}`)
  }

  for (const agent of snap.agents.agents.slice(0, 50)) {
    if (!Number.isFinite(agent.energy) || !agent.bodyPlan || !agent.senses) {
      pass = false
      notes.push('invalid agent state detected')
      break
    }
  }

  const inactiveOutside = snap.world.tiles.filter(
    (t, i) => !snap.world.activeMask[i] && t.terrain !== 'void',
  ).length
  if (inactiveOutside > 0) {
    pass = false
    notes.push(`circular mask violation: ${inactiveOutside} inactive non-void tiles`)
  }

  return {
    speed,
    label: speed,
    targetSeconds,
    ticksRun,
    elapsedMs,
    finalAgents: snap.agents.totalAgents,
    finalOrganisms: snap.life.totalOrganisms,
    eventCount: snap.events.length,
    stabilityWarning: engine.getStabilityWarning(),
    pass,
    notes,
  }
}

const phases: { speed: SimSpeed; seconds: number }[] = [
  { speed: 'normal', seconds: 30 },
  { speed: 'fast', seconds: 30 },
  { speed: 'superfast', seconds: 60 },
  { speed: 'ultrafast', seconds: 60 },
]

console.log(`EvoSphere QA gate — ${width}×${height} (${PRESET}), seed ${SEED}\n`)

const results: PhaseResult[] = []
for (const phase of phases) {
  const result = runPhase(phase.speed, phase.seconds)
  results.push(result)
  const status = result.pass ? 'PASS' : 'FAIL'
  console.log(
    `[${status}] ${phase.speed} × ${phase.seconds}s — ticks ${result.ticksRun}, agents ${result.finalAgents}, events ${result.eventCount}, ${(result.elapsedMs / 1000).toFixed(1)}s wall`,
  )
  if (result.stabilityWarning) console.log(`  warning: ${result.stabilityWarning}`)
  if (result.notes.length) console.log(`  notes: ${result.notes.join('; ')}`)
}

const deepEngine = new SimEngine({
  seed: SEED,
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})
const deepSummary = deepEngine.runDeepTimeYears(1000)
console.log(
  `\nDeep time +1K yr: ${deepSummary.startOrganisms} → ${deepSummary.endOrganisms} organisms (${deepSummary.runtimeSeconds.toFixed(1)}s)`,
)

const allPass = results.every((r) => r.pass)
console.log(`\nQA GATE: ${allPass ? 'PASS' : 'FAIL'}`)
process.exit(allPass ? 0 : 1)
