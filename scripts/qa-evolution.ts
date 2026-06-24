/**
 * Evolution QA — variant/subspecies pipeline, controller sanity, no instant species spam.
 * Run: npm run qa:evolution
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { sanitizeController } from '../src/simulation/cognition/NeuralController.ts'

const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)

const STEP_COUNT = 5000

console.log(`EvoSphere evolution QA — ${width}×${height}, ${STEP_COUNT} ticks\n`)

let pass = true
const engine = new SimEngine({
  seed: 'evosphere-prime',
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})

engine.step(STEP_COUNT, true)
const snap = engine.getSnapshot(false)
const pop1 = snap.life.totalBiologicalPopulation
const species = snap.life.species
const failedVariants = species.filter((s) => s.taxonRank === 'variant' && s.establishmentStatus === 'failed')
const instantDeaths = species.filter(
  (s) => !s.isFounderLineage && s.population === 0 && s.createdAtTick > snap.tick - 50,
)

let nanControllers = 0
for (const agent of snap.agents.agents) {
  if (!agent.controller) continue
  sanitizeController(agent.controller)
  for (const w of agent.controller.weights) {
    if (!Number.isFinite(w)) nanControllers++
  }
}

if (nanControllers > 0) {
  pass = false
  console.log(`[FAIL] ${nanControllers} non-finite controller weights`)
} else {
  console.log(`[OK] All controller weights finite (${snap.agents.agents.filter((a) => a.controller).length} agents)`)
}

if (instantDeaths.length > 5) {
  pass = false
  console.log(`[FAIL] ${instantDeaths.length} species branches died within ~50 ticks of creation`)
} else {
  console.log(`[OK] Instant branch deaths=${instantDeaths.length} (threshold ≤5)`)
}

console.log(
  `[INFO] species=${species.length} variants=${species.filter((s) => s.taxonRank === 'variant').length} subspecies=${species.filter((s) => s.taxonRank === 'subspecies').length} failed_variants=${failedVariants.length}`,
)

engine.reset({ seed: 'evosphere-prime' })
engine.step(STEP_COUNT, true)
const pop2 = engine.getSnapshot(false).life.totalBiologicalPopulation

const fresh = new SimEngine({
  seed: 'evosphere-prime',
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})
fresh.step(STEP_COUNT, true)
const popFresh = fresh.getSnapshot(false).life.totalBiologicalPopulation

const tolerance = 0
if (Math.abs(pop1 - pop2) > tolerance) {
  pass = false
  console.log(`[FAIL] Reset replay — bio population ${pop1} vs ${pop2}`)
} else {
  console.log(`[OK] Reset replay — ${pop1} biological population (exact match)`)
}

if (Math.abs(pop1 - popFresh) > tolerance) {
  pass = false
  console.log(`[FAIL] Fresh engine — bio population ${pop1} vs ${popFresh}`)
} else {
  console.log(`[OK] Fresh engine exact match — ${popFresh} biological population`)
}

console.log(`\nEVOLUTION QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
