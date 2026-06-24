/**
 * Succession QA — initial worlds must not have biological forests/grasslands/swamps at birth.
 * Run: npm run qa:succession
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { LEGACY_BIOTIC_TERRAINS } from '../src/simulation/world/terrainHelpers.ts'

const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const SEEDS = ['evosphere-prime', 'world-101-202', 'origin-test-alpha']

console.log(`EvoSphere succession QA — ${width}×${height}\n`)

let pass = true

for (const seed of SEEDS) {
  const engine = new SimEngine({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })
  const world = engine.getWorld()

  let bioticAtBirth = 0
  let barrenLand = 0
  for (const tile of world.tiles) {
    if (tile.terrain === 'void') continue
    if (LEGACY_BIOTIC_TERRAINS.has(tile.terrain)) bioticAtBirth++
    if (tile.ecosystem !== 'none') bioticAtBirth++
    if (
      tile.terrain === 'barren' ||
      tile.terrain === 'sand' ||
      tile.terrain === 'fertile_plain' ||
      tile.terrain === 'basin' ||
      tile.terrain === 'rock'
    ) {
      barrenLand++
    }
  }

  if (bioticAtBirth > 0) {
    pass = false
    console.log(`[FAIL] ${seed} — ${bioticAtBirth} biotic terrain/ecosystem tiles at world birth`)
  } else {
    console.log(`[OK] ${seed} — no biotic biomes at birth · barren-like land tiles=${barrenLand}`)
  }

  // Run 500 ticks — expect some succession if life exists
  engine.step(500, true)
  const snap = engine.getSuccessionSnapshot()
  console.log(
    `     after 500 ticks: barren ${snap.barrenPercent.toFixed(0)}% · microbial ${snap.microbialPercent.toFixed(0)}% · forest ${snap.forestPercent.toFixed(0)}%`,
  )
}

console.log(`\nSUCCESSION QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
