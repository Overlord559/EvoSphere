/**
 * Reset replay determinism QA — same seed, settings, and step count must match exactly.
 * Run: npm run qa:determinism
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const STEP_COUNT = 5000
const BIOMASS_TOLERANCE = 0.001

interface SimFingerprint {
  organisms: number
  agents: number
  bioOrganisms: number
  bioAgents: number
  biomass: number
  aliveSpecies: number
  variants: number
  subspecies: number
  activeDisasters: number
  events: number
}

function fingerprint(engine: SimEngine): SimFingerprint {
  const snap = engine.getSnapshot(false)
  const alive = snap.life.species.filter((s) => s.population > 0)
  return {
    organisms: snap.life.totalOrganisms,
    agents: snap.agents.totalAgents,
    bioOrganisms: snap.life.totalBiologicalPopulation,
    bioAgents: snap.agents.totalMobilePopulation,
    biomass: Math.round(snap.life.totalBiomass * 1000) / 1000,
    aliveSpecies: alive.length,
    variants: snap.life.species.filter((s) => s.taxonRank === 'variant' && s.establishmentStatus !== 'failed').length,
    subspecies: snap.life.species.filter((s) => s.taxonRank === 'subspecies').length,
    activeDisasters: snap.disasters?.active.length ?? 0,
    events: snap.events.length,
  }
}

function compare(a: SimFingerprint, b: SimFingerprint, label: string): string[] {
  const diffs: string[] = []
  if (a.organisms !== b.organisms) diffs.push(`${label}: tracked organisms ${a.organisms} vs ${b.organisms}`)
  if (a.agents !== b.agents) diffs.push(`${label}: tracked agents ${a.agents} vs ${b.agents}`)
  if (a.bioOrganisms !== b.bioOrganisms) diffs.push(`${label}: bio organisms ${a.bioOrganisms} vs ${b.bioOrganisms}`)
  if (a.bioAgents !== b.bioAgents) diffs.push(`${label}: bio agents ${a.bioAgents} vs ${b.bioAgents}`)
  if (Math.abs(a.biomass - b.biomass) > BIOMASS_TOLERANCE) {
    diffs.push(`${label}: biomass ${a.biomass} vs ${b.biomass}`)
  }
  if (a.aliveSpecies !== b.aliveSpecies) diffs.push(`${label}: alive species ${a.aliveSpecies} vs ${b.aliveSpecies}`)
  if (a.variants !== b.variants) diffs.push(`${label}: variants ${a.variants} vs ${b.variants}`)
  if (a.subspecies !== b.subspecies) diffs.push(`${label}: subspecies ${a.subspecies} vs ${b.subspecies}`)
  if (a.activeDisasters !== b.activeDisasters) {
    diffs.push(`${label}: active disasters ${a.activeDisasters} vs ${b.activeDisasters}`)
  }
  return diffs
}

const settings = {
  seed: SEED,
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
}

console.log(`EvoSphere determinism QA — ${width}×${height}, seed ${SEED}, ${STEP_COUNT} ticks\n`)

const runA = new SimEngine(settings)
runA.step(STEP_COUNT, true)
const fpA = fingerprint(runA)

runA.reset({ seed: SEED })
runA.step(STEP_COUNT, true)
const fpReplay = fingerprint(runA)

const runB = new SimEngine(settings)
runB.step(STEP_COUNT, true)
const fpFresh = fingerprint(runB)

const replayDiffs = compare(fpA, fpReplay, 'reset replay')
const freshDiffs = compare(fpA, fpFresh, 'fresh engine')

let pass = true
if (replayDiffs.length === 0) {
  console.log(`[OK] Reset replay exact match — orgs ${fpA.organisms}, agents ${fpA.agents}, biomass ${fpA.biomass}`)
} else {
  pass = false
  console.log('[FAIL] Reset replay mismatch:')
  for (const d of replayDiffs) console.log(`  ${d}`)
}

if (freshDiffs.length === 0) {
  console.log(`[OK] Fresh engine exact match — orgs ${fpFresh.organisms}, agents ${fpFresh.agents}`)
} else {
  pass = false
  console.log('[FAIL] Fresh engine mismatch:')
  for (const d of freshDiffs) console.log(`  ${d}`)
}

console.log(
  `\nFingerprint: species=${fpA.aliveSpecies} variants=${fpA.variants} subspecies=${fpA.subspecies} disasters=${fpA.activeDisasters} events=${fpA.events}`,
)
console.log(`\nDETERMINISM QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
