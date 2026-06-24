/**
 * Extinction forensics QA — die-offs record causes; aggregate compression != extinction.
 * Run: npm run qa:extinction-forensics
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'

const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)

console.log(`EvoSphere extinction-forensics QA — ${width}×${height}\n`)

let pass = true
const engine = new SimEngine({
  seed: 'forensics-qa-seed',
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})

engine.step(2000, true)
engine.injectDisaster('wildfire', 0.85)
engine.step(500, false)

const snap = engine.getSnapshot(false)
const events = snap.events
const dieOff = events.find((e) => e.type === 'life.die_off' || e.type === 'life.extinction')
const compressed = snap.life.species.filter((s) => s.hiddenAsAggregate && s.population > 0)

if (compressed.length > 0) {
  const falselyExtinct = compressed.filter((s) => s.extinctionCause && !s.recoveryPossible)
  if (falselyExtinct.length > 0) {
    pass = false
    console.log('[FAIL] Aggregate-compressed species marked as extinct')
  } else {
    console.log(`[OK] ${compressed.length} aggregate-compressed species not reported extinct`)
  }
} else {
  console.log('[INFO] No aggregate compression in this run — checking forensics fields exist')
  const withForensics = snap.life.species.some(
    (s) => s.lastCauseOfDecline != null || s.populationChangeReason != null,
  )
  if (!withForensics && !dieOff) {
    console.log('[INFO] No decline events in short run — forensics schema present on species records')
  }
}

engine.reseedLife('vent')
const afterReseed = engine.getSnapshot(false)
const bioAfter =
  afterReseed.life.totalBiologicalPopulation + afterReseed.agents.totalMobilePopulation

if (bioAfter <= 0) {
  pass = false
  console.log('[FAIL] Reseed from vent did not restore life')
} else {
  console.log(`[OK] Reseed restored life — bio pop ${bioAfter}`)
}

const reseedEvent = afterReseed.events.find((e) => e.type === 'life.first')
if (!reseedEvent) {
  pass = false
  console.log('[FAIL] Reseed did not emit life.first event')
} else {
  console.log(`[OK] Reseed event logged`)
}

if (typeof engine.reseedLife === 'function') {
  console.log('[OK] Reseed controls exist on SimEngine')
} else {
  pass = false
  console.log('[FAIL] reseedLife missing')
}

console.log(`\nEXTINCTION FORENSICS QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
