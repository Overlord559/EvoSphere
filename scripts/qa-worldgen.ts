/**
 * World generation variety QA — verifies biome diversity and origin determinism.
 * Run: npm run qa:worldgen
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import type { TerrainType } from '../src/types/simulation.ts'

const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)

const TEST_SEEDS = [
  'evosphere-prime',
  'world-101-202',
  'world-303-404',
  'world-505-606',
  'origin-test-alpha',
  'origin-test-beta',
]

const REQUIRED_BIOMES: TerrainType[] = ['tundra', 'swamp', 'mountain']

function terrainCounts(world: ReturnType<SimEngine['getWorld']>): Map<TerrainType, number> {
  const counts = new Map<TerrainType, number>()
  for (const tile of world.tiles) {
    if (tile.terrain === 'void') continue
    counts.set(tile.terrain, (counts.get(tile.terrain) ?? 0) + 1)
  }
  return counts
}

console.log(`EvoSphere worldgen QA — ${width}×${height} (${PRESET})\n`)

let pass = true
const originProfiles = new Set<string>()

for (const seed of TEST_SEEDS) {
  const engine = new SimEngine({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })
  const world = engine.getWorld()
  const counts = terrainCounts(world)
  const profile = world.originProfile.originProfileName
  originProfiles.add(profile)

  const missing = REQUIRED_BIOMES.filter((b) => (counts.get(b) ?? 0) < 3)
  const hasMarshOrSwamp = (counts.get('marsh') ?? 0) + (counts.get('swamp') ?? 0) >= 3
  const hasCold = (counts.get('tundra') ?? 0) + (counts.get('snow') ?? 0) >= 3

  if (missing.length > 0 && !hasCold) {
    console.log(`[WARN] ${seed} — sparse cold biomes: ${missing.join(', ')}`)
  }
  if (!hasMarshOrSwamp) {
    console.log(`[WARN] ${seed} — sparse wet lowlands`)
  }

  const engine2 = new SimEngine({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
  })
  const world2 = engine2.getWorld()
  if (world2.originProfile.originProfileName !== profile) {
    pass = false
    console.log(`[FAIL] ${seed} — origin profile not deterministic`)
  }
  if (world2.originProfile.founderTileIds.length !== world.originProfile.founderTileIds.length) {
    pass = false
    console.log(`[FAIL] ${seed} — founder tiles not deterministic`)
  }

  console.log(
    `[OK] ${seed} — origin=${profile}, founders=${world.originProfile.founderTileIds.length}, ` +
      `tundra=${counts.get('tundra') ?? 0}, snow=${counts.get('snow') ?? 0}, marsh=${counts.get('marsh') ?? 0}, ` +
      `swamp=${counts.get('swamp') ?? 0}, mountain=${counts.get('mountain') ?? 0}`,
  )
}

if (originProfiles.size < 2) {
  pass = false
  console.log(`\n[FAIL] Origin profiles too similar across seeds (${originProfiles.size} unique)`)
} else {
  console.log(`\nOrigin profile variety: ${originProfiles.size} unique profiles across ${TEST_SEEDS.length} seeds`)
}

console.log(`\nWORLDGEN QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
