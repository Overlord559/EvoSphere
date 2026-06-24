/**
 * World variety QA — multiple seeds must produce different terrain/origin distributions.
 * Run: npm run qa:world-variety
 */
import { generateWorld } from '../src/simulation/world/generateWorld.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'

const SEEDS = [
  'evosphere-prime',
  'world-alpha-001',
  'world-beta-442',
  'world-gamma-991',
  'world-delta-123',
  'world-epsilon-777',
  'world-zeta-314',
  'world-eta-555',
  'world-theta-888',
  'world-iota-202',
]

const { width, height } = dimensionsForPreset(DEFAULT_WORLD_SIZE_PRESET)
console.log(`EvoSphere world-variety QA — ${width}×${height}, ${SEEDS.length} seeds\n`)

let pass = true
const landOceanRatios: number[] = []
const originTileSets: string[] = []
const archetypeLabels = new Set<string>()

for (const seed of SEEDS) {
  const world = generateWorld({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 1,
    worldSizePreset: DEFAULT_WORLD_SIZE_PRESET,
    originScenarioId: 'random_mixed',
    worldArchetype: 'random',
  })

  let land = 0
  let ocean = 0
  let vents = 0
  let snow = 0
  for (let i = 0; i < world.tiles.length; i++) {
    if (!world.activeMask[i]) continue
    const t = world.tiles[i].terrain
    if (t === 'ocean' || t === 'deep_ocean' || t === 'coast') ocean += 1
    else if (t !== 'void') land += 1
    if (t === 'hydrothermal_vent') vents += 1
    if (t === 'snow' || t === 'tundra') snow += 1
  }
  const active = land + ocean
  const ratio = active > 0 ? land / active : 0
  landOceanRatios.push(ratio)
  originTileSets.push(world.originProfile.founderTileIds.sort((a, b) => a - b).join(','))
  if (world.worldArchetypeLabel) archetypeLabels.add(world.worldArchetypeLabel)

  console.log(
    `[seed ${seed}] land/ocean ${(ratio * 100).toFixed(1)}% land · vents ${vents} · cold ${snow} · origins ${world.originProfile.founderSites.length} · ${world.originProfile.originScenarioLabel ?? world.originProfile.originProfileName}`,
  )
}

const uniqueRatios = new Set(landOceanRatios.map((r) => r.toFixed(2)))
const uniqueOrigins = new Set(originTileSets.filter((s) => s.length > 0))

if (uniqueRatios.size < 3) {
  pass = false
  console.log(`[FAIL] Land/ocean ratios too similar across seeds (${uniqueRatios.size} unique)`)
} else {
  console.log(`[OK] Land/ocean ratio diversity — ${uniqueRatios.size} distinct profiles`)
}

if (uniqueOrigins.size < Math.min(5, SEEDS.length - 1)) {
  pass = false
  console.log(`[FAIL] Origin tile sets too similar (${uniqueOrigins.size} unique)`)
} else {
  console.log(`[OK] Origin tile diversity — ${uniqueOrigins.size} distinct origin layouts`)
}

if (archetypeLabels.size < 2) {
  console.log(`[INFO] Archetype labels — ${archetypeLabels.size} (random pool may repeat on small sample)`)
} else {
  console.log(`[OK] Archetype diversity — ${archetypeLabels.size} labels`)
}

console.log(`\nWORLD VARIETY QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
