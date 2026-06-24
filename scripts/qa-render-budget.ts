/**
 * Render budget QA — high-pop snapshot must respect moving/producer glyph caps.
 * Run: npm run qa:render-budget
 */
import { SimEngine } from '../src/simulation/engine/SimEngine.ts'
import {
  applyRenderBudget,
  RENDER_BUDGET,
} from '../src/ui/viewport/renderBudget.ts'
import { DEFAULT_WORLD_SIZE_PRESET, dimensionsForPreset } from '../src/simulation/world/worldSizePresets.ts'

const SEED = 'evosphere-prime'
const PRESET = DEFAULT_WORLD_SIZE_PRESET
const { width, height } = dimensionsForPreset(PRESET)
const TICKS = 8000

console.log(`EvoSphere render-budget QA — ${width}×${height}, ${TICKS} ticks\n`)

let pass = true
const engine = new SimEngine({
  seed: SEED,
  worldWidth: width,
  worldHeight: height,
  tickRate: 10,
  worldSizePreset: PRESET,
})

engine.step(TICKS, true)
const snap = engine.getSnapshot(true)
const viewBounds = {
  minTileX: 0,
  minTileY: 0,
  maxTileX: width - 1,
  maxTileY: height - 1,
}

const closeBudget = applyRenderBudget(
  {
    zoom: 3,
    viewBounds,
    agents: snap.agents.agents,
    organisms: snap.life.organisms,
    populationUnits: snap.life.populationUnits,
    selectedSpeciesId: null,
    selectedTileIndex: null,
  },
  width,
)

const farBudget = applyRenderBudget(
  {
    zoom: 0.4,
    viewBounds,
    agents: snap.agents.agents,
    organisms: snap.life.organisms,
    populationUnits: snap.life.populationUnits,
    selectedSpeciesId: null,
    selectedTileIndex: null,
    overload: true,
  },
  width,
)

const movingDrawn =
  closeBudget.agentsToDraw.length + closeBudget.cohortUnitsToDraw.length

if (movingDrawn > RENDER_BUDGET.maxMovingGlyphsHard) {
  pass = false
  console.log(`[FAIL] Moving glyphs ${movingDrawn} > hard cap ${RENDER_BUDGET.maxMovingGlyphsHard}`)
} else {
  console.log(`[OK] Moving glyphs ${movingDrawn} <= hard cap ${RENDER_BUDGET.maxMovingGlyphsHard}`)
}

if (closeBudget.producerUnitsToDraw.length > RENDER_BUDGET.maxProducerGlyphsDefault + 20) {
  pass = false
  console.log(`[FAIL] Producer glyphs ${closeBudget.producerUnitsToDraw.length} exceed budget`)
} else {
  console.log(`[OK] Producer glyphs ${closeBudget.producerUnitsToDraw.length}`)
}

if (!farBudget.densityOnlyMode) {
  pass = false
  console.log('[FAIL] Far zoom / overload did not activate density-only mode')
} else {
  console.log('[OK] Density-only mode active at far zoom / overload')
}

if (closeBudget.skippedMovingGlyphs <= 0 && snap.agents.totalAgents > RENDER_BUDGET.maxMovingGlyphsDefault) {
  console.log('[INFO] No skipped glyphs despite high agent count — may be under cap naturally')
} else if (closeBudget.skippedMovingGlyphs > 0) {
  console.log(`[OK] Skipped ${closeBudget.skippedMovingGlyphs} moving glyphs due to budget`)
}

console.log(`\nRENDER BUDGET QA: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
