/**
 * Population architecture QA — aggregate growth, no legacy cap stall, bounded tracked entities.
 * Run: npm run qa:population
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { LEGACY_MAX_TOTAL_AGENTS, LEGACY_MAX_TOTAL_ORGANISMS } from '../src/simulation/ecology/populationConfig.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const TICKS = 8000

console.log(`EvoSphere population QA — ${width}×${height}, ${TICKS} ticks\n`)

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
const popArch = life.populationArchitecture
const config = engine.getWorld().width > 0 ? life.populationArchitecture : null

const bioPop = life.totalBiologicalPopulation + agents.totalMobilePopulation
const trackedBounded = life.totalOrganisms <= 12000 && agents.totalAgents <= 1200

if (!trackedBounded) {
  pass = false
  console.log(
    `[FAIL] Tracked entities exceed budget — orgs ${life.totalOrganisms}, agents ${agents.totalAgents}`,
  )
} else {
  console.log(
    `[OK] Tracked bounded — orgs ${life.totalOrganisms}, agents ${agents.totalAgents}`,
  )
}

const legacyOrganismStall =
  life.totalOrganisms >= LEGACY_MAX_TOTAL_ORGANISMS * 0.97 &&
  life.aggregateOrganisms === 0 &&
  bioPop <= LEGACY_MAX_TOTAL_ORGANISMS * 1.02

if (legacyOrganismStall) {
  pass = false
  console.log(`[FAIL] Organisms stalled at legacy cap ${LEGACY_MAX_TOTAL_ORGANISMS} with no aggregate growth`)
} else {
  console.log(
    `[OK] No legacy organism cap stall — tracked ${life.totalOrganisms}, aggregate ${life.aggregateOrganisms}, bio ${life.totalBiologicalPopulation}`,
  )
}

const legacyAgentStall =
  agents.totalAgents >= LEGACY_MAX_TOTAL_AGENTS * 0.97 &&
  agents.populationReserve === 0 &&
  agents.totalMobilePopulation <= LEGACY_MAX_TOTAL_AGENTS * 1.02

if (legacyAgentStall) {
  pass = false
  console.log(`[FAIL] Agents stalled at legacy cap ${LEGACY_MAX_TOTAL_AGENTS} with no reserve`)
} else {
  console.log(
    `[OK] No legacy agent cap stall — tracked ${agents.totalAgents}, reserve ${agents.populationReserve}, mobile ${agents.totalMobilePopulation}`,
  )
}

if (bioPop > LEGACY_MAX_TOTAL_ORGANISMS && life.aggregateOrganisms > 0) {
  console.log(`[OK] Biological population exceeded legacy organism cap (${bioPop} > ${LEGACY_MAX_TOTAL_ORGANISMS})`)
} else if (life.totalBiologicalPopulation > LEGACY_MAX_TOTAL_ORGANISMS * 0.5) {
  console.log(`[INFO] Biological pop ${life.totalBiologicalPopulation} (aggregate ${life.aggregateOrganisms})`)
}

if (!Number.isFinite(life.totalBiomass) || !Number.isFinite(life.aggregateBiomass)) {
  pass = false
  console.log('[FAIL] NaN biomass detected')
} else {
  console.log(`[OK] Biomass finite — tracked ${life.totalBiomass.toFixed(1)}, aggregate ${life.aggregateBiomass.toFixed(1)}`)
}

if (popArch.bottleneckKind === 'artificial_cap_bottleneck' || popArch.artificialCapEngaged) {
  console.log(`[INFO] Artificial cap pressure detected — kind=${popArch.bottleneckKind}, repr-cap=${popArch.representationCapped}`)
} else {
  console.log(`[INFO] Capacity pressure ${popArch.capacityPressurePct}% — plateau ecological or growing`)
}

void config

engine.reset({ seed: SEED })
engine.step(TICKS, true)
const snap2 = engine.getSnapshot(false)
if (snap2.life.totalBiologicalPopulation !== life.totalBiologicalPopulation) {
  pass = false
  console.log(
    `[FAIL] Determinism — bio pop ${life.totalBiologicalPopulation} vs ${snap2.life.totalBiologicalPopulation}`,
  )
} else {
  console.log(`[OK] Deterministic biological population — ${life.totalBiologicalPopulation}`)
}

console.log(`\nPOPULATION QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
