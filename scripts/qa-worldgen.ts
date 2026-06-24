/**
 * World generation variety QA — abiotic terrain at birth, origin determinism.
 * Run: npm run qa:worldgen
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'
import { LEGACY_BIOTIC_TERRAINS } from '../src/simulation/world/terrainHelpers.ts'
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

const REQUIRED_ABIOTIC: TerrainType[] = ['basin', 'fertile_plain', 'barren', 'mountain']

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
const originTileSets = new Set<string>()

for (const seed of TEST_SEEDS) {
  const engine = new SimEngine({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
    originScenarioId: 'random_mixed',
    worldArchetype: 'random',
  })
  const world = engine.getWorld()
  const counts = terrainCounts(world)
  const profile = world.originProfile.originScenarioId ?? world.originProfile.originProfileName
  originProfiles.add(profile)
  originTileSets.add([...world.originProfile.founderTileIds].sort((a, b) => a - b).join(','))

  let bioticAtBirth = 0
  for (const tile of world.tiles) {
    if (LEGACY_BIOTIC_TERRAINS.has(tile.terrain) || tile.ecosystem !== 'none') bioticAtBirth++
  }
  if (bioticAtBirth > 0) {
    pass = false
    console.log(`[FAIL] ${seed} — ${bioticAtBirth} biotic terrain tiles at world birth`)
  }

  const hasWetLowland = (counts.get('basin') ?? 0) + (counts.get('coast') ?? 0) >= 3
  const hasCold = (counts.get('tundra') ?? 0) + (counts.get('snow') ?? 0) >= 3
  const hasBarren = REQUIRED_ABIOTIC.some((b) => (counts.get(b) ?? 0) >= 3)

  if (!hasWetLowland) console.log(`[WARN] ${seed} — sparse wet lowlands`)
  if (!hasCold) console.log(`[WARN] ${seed} — sparse cold terrain`)
  if (!hasBarren) console.log(`[WARN] ${seed} — sparse barren/fertile land`)

  const engine2 = new SimEngine({
    seed,
    worldWidth: width,
    worldHeight: height,
    tickRate: 10,
    worldSizePreset: PRESET,
    originScenarioId: 'random_mixed',
    worldArchetype: 'random',
  })
  const world2 = engine2.getWorld()
  const profile2 = world2.originProfile.originScenarioId ?? world2.originProfile.originProfileName
  const tiles1 = [...world.originProfile.founderTileIds].sort((a, b) => a - b).join(',')
  const tiles2 = [...world2.originProfile.founderTileIds].sort((a, b) => a - b).join(',')
  if (profile2 !== profile || tiles1 !== tiles2) {
    pass = false
    console.log(`[FAIL] ${seed} — origin profile not deterministic`)
  }

  console.log(
    `[OK] ${seed} — origin=${profile}, founders=${world.originProfile.founderTileIds.length}, ` +
      `barren=${counts.get('barren') ?? 0}, basin=${counts.get('basin') ?? 0}, fertile=${counts.get('fertile_plain') ?? 0}, ` +
      `mountain=${counts.get('mountain') ?? 0}, biotic_at_birth=${bioticAtBirth}`,
  )
}

if (originTileSets.size < 2) {
  pass = false
  console.log(`\n[FAIL] Origin founder layouts too similar (${originTileSets.size} unique tile sets)`)
} else {
  console.log(`\nOrigin variety: ${originProfiles.size} scenario ids · ${originTileSets.size} unique founder layouts`)
}

console.log(`\nWORLDGEN QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
