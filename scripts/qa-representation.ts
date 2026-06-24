/**
 * Representation / cohort QA — bounded units at high biological population.
 * Run: npm run qa:representation
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { MAX_POPULATION_UNITS_TOTAL } from '../src/simulation/ecology/populationUnits.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const TICKS = 10000
const LEGACY_CRASH_POP = 14000

console.log(`EvoSphere representation QA — ${width}×${height}, ${TICKS} ticks\n`)

let pass = true
const engine = new SimEngine({
  seed: SEED,
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})

engine.step(TICKS, true)
const snap = engine.getSnapshot(false)
const life = snap.life
const agents = snap.agents
const rep = life.representationMetrics

const estBio = life.totalBiologicalPopulation + agents.totalMobilePopulation
const trackedBounded = life.totalOrganisms <= 12000 && agents.totalAgents <= 1200
const unitsBounded = rep.populationUnitsCount <= MAX_POPULATION_UNITS_TOTAL + 200

if (!trackedBounded) {
  pass = false
  console.log(`[FAIL] Tracked entities exceed budget — orgs ${life.totalOrganisms}, agents ${agents.totalAgents}`)
} else {
  console.log(`[OK] Tracked bounded — orgs ${life.totalOrganisms}, agents ${agents.totalAgents}`)
}

if (!unitsBounded) {
  pass = false
  console.log(`[FAIL] Population units unbounded — ${rep.populationUnitsCount} > ${MAX_POPULATION_UNITS_TOTAL}`)
} else {
  console.log(`[OK] Population units bounded — ${rep.populationUnitsCount} units (max ${MAX_POPULATION_UNITS_TOTAL})`)
}

if (estBio <= LEGACY_CRASH_POP) {
  console.log(`[INFO] Est. bio ${estBio} — below legacy crash threshold ${LEGACY_CRASH_POP} (may need longer run)`)
} else {
  console.log(`[OK] Est. biological population ${estBio} exceeds legacy crash threshold ${LEGACY_CRASH_POP}`)
}

if (rep.producerUnits <= 0 && life.aggregateOrganisms > 0) {
  pass = false
  console.log('[FAIL] Producer aggregate exists but no producer units recorded')
} else {
  console.log(`[OK] Producer units ${rep.producerUnits}, mobile cohorts ${rep.mobileCohorts}`)
}

if (!Number.isFinite(rep.compressionRatio) || rep.compressionRatio < 0) {
  pass = false
  console.log('[FAIL] Invalid compression ratio')
} else {
  console.log(`[OK] Compression ratio ${rep.compressionRatio}× (avg ${rep.averageRepresentedPerUnit}/unit)`)
}

for (const unit of life.populationUnits) {
  if (!Number.isFinite(unit.representedIndividuals) || !Number.isFinite(unit.biomass)) {
    pass = false
    console.log(`[FAIL] NaN in population unit ${unit.id}`)
    break
  }
}
if (pass) console.log('[OK] No NaN in population unit sample')

engine.reset({ seed: SEED })
engine.step(TICKS, true)
const snap2 = engine.getSnapshot(false)
if (snap2.life.totalBiologicalPopulation !== life.totalBiologicalPopulation) {
  pass = false
  console.log(
    `[FAIL] Determinism — bio ${life.totalBiologicalPopulation} vs ${snap2.life.totalBiologicalPopulation}`,
  )
} else {
  console.log(`[OK] Deterministic — bio pop ${life.totalBiologicalPopulation}, units ${rep.populationUnitsCount}`)
}

console.log(`\nREPRESENTATION QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
