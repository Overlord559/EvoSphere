/**
 * Browser Arcade Evolution gate — requires dev server + Playwright chromium.
 * Run: npm run dev (separate terminal) then npm run qa:arcade-browser-gate
 */
import { chromium } from 'playwright'
import { hudMilestoneMetrics } from '../src/ui/panels/hudMilestoneMetrics.ts'

const DEV_URL = process.env.EVOSPHERE_DEV_URL ?? 'http://localhost:5173/'
const CHECKPOINTS = [0, 50, 100, 200, 300, 400]

interface SampleRow {
  targetYear: number
  actualYear: number
  era: string
  milestones: ReturnType<typeof hudMilestoneMetrics>
  perf: Record<string, unknown>
  workerInitState: string
  workerFallbackReason: string | null
}

async function samplePage(page: import('playwright').Page, targetYear: number): Promise<SampleRow> {
  const row = await page.evaluate((target) => {
    const qa = (globalThis as { __evosphereQa: { store: { getState: () => unknown } } }).__evosphereQa
    const state = qa.store.getState() as {
      snapshot: import('../src/types/simulation').SimulationSnapshot
      workerInitState?: string
      workerFallbackReason?: string | null
      runtime: {
        simulatedYear?: number
        internalTick?: number
        performance?: Record<string, unknown>
      }
    }
    const actualYear =
      (state.runtime.performance?.simulatedYearDisplay as number | undefined) ??
      state.runtime.simulatedYear ??
      (state.runtime.internalTick ?? 0) / 10
    return {
      targetYear: target,
      actualYear,
      era: state.snapshot.briefing.era ?? state.snapshot.eraDirector?.focusLayer ?? '—',
      snapshot: state.snapshot,
      perf: state.runtime.performance ?? {},
      workerInitState: state.workerInitState ?? 'unknown',
      workerFallbackReason: state.workerFallbackReason ?? null,
    }
  }, targetYear)
  return {
    targetYear: row.targetYear,
    actualYear: row.actualYear,
    era: row.era,
    milestones: hudMilestoneMetrics(row.snapshot),
    perf: row.perf,
    workerInitState: row.workerInitState,
    workerFallbackReason: row.workerFallbackReason,
  }
}

async function waitForSimYear(page: import('playwright').Page, minYear: number, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (y) => {
      const qa = (globalThis as { __evosphereQa?: { store: { getState: () => unknown } } }).__evosphereQa
      if (!qa) return false
      const state = qa.store.getState() as {
        runtime: {
          simulatedYear?: number
          internalTick?: number
          performance?: { simulatedYearDisplay?: number }
          isRunning?: boolean
        }
      }
      const yr =
        state.runtime.performance?.simulatedYearDisplay ??
        state.runtime.simulatedYear ??
        (state.runtime.internalTick ?? 0) / 10
      return yr >= y
    },
    minYear,
    { timeout: timeoutMs },
  )
}

async function applyCameraPreset(page: import('playwright').Page, presetId: string): Promise<void> {
  await page.evaluate((id) => {
    const qa = (globalThis as { __evosphereQa: { store: { getState: () => Record<string, unknown> } } }).__evosphereQa
    const api = qa.store.getState()
    ;(api.applyCameraPreset as (p: string) => void)(id)
  }, presetId)
  await page.waitForTimeout(800)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (globalThis as { __evosphereQa?: unknown }).__evosphereQa != null, null, {
    timeout: 45_000,
  })

  await page.evaluate(() => {
    const qa = (globalThis as { __evosphereQa: { store: { getState: () => Record<string, unknown> } } }).__evosphereQa
    const api = qa.store.getState()
    ;(api.enableArcadeEvolutionMode as () => void)()
    ;(api.setSoakHudExpanded as (v: boolean) => void)(true)
    ;(api.setRenderPipeline as (p: string) => void)('2.5d')
  })

  await page.waitForFunction(
    () => {
      const qa = (globalThis as { __evosphereQa?: { store: { getState: () => { workerInitState?: string } } } })
        .__evosphereQa
      if (!qa) return false
      const st = qa.store.getState().workerInitState
      return st === 'ready' || st === 'fallback'
    },
    null,
    { timeout: 60_000 },
  )

  await page.waitForTimeout(12_000)

  const samples: SampleRow[] = []
  for (const target of CHECKPOINTS) {
    if (target > 0) {
      await waitForSimYear(page, target, 180_000)
    }
    if (target === 200) {
      await applyCameraPreset(page, 'life_bloom_coast')
    }
    if (target === 400) {
      await applyCameraPreset(page, 'creature_cohorts')
    }
    const row = await samplePage(page, target)
    samples.push(row)
    const cand = Number(row.perf.candidateMovingGlyphs ?? 0)
    const drawn = Number(row.perf.renderedMovingGlyphs ?? 0) + Number(row.perf.renderedProducerGlyphs ?? 0)
    const agg = Number(row.perf.showcaseAggregateMarkers ?? 0)
    console.log(
      `  target yr ${target} (actual ${row.actualYear.toFixed(1)}): micro=${row.milestones.microPop} prod=${row.milestones.producerSpecies}sp mobile=${row.milestones.mobileAgents}+${row.milestones.mobilePop} cand=${cand} draw=${drawn} agg=${agg} render=${row.perf.renderMsLastFrame ?? '—'}ms RAF=${row.perf.rafLoopCount ?? '—'} wk=${row.workerInitState}`,
    )
  }

  await browser.close()

  const nearest = (y: number) =>
    samples.reduce((best, s) =>
      Math.abs(s.actualYear - y) < Math.abs(best.actualYear - y) ? s : best,
    samples[0]!)

  const y100 = nearest(100)
  const y200 = nearest(200)
  const y400 = nearest(400)

  let pass = true
  const blockers: string[] = []

  const workerError = samples.find((s) => s.workerInitState === 'error' || s.workerInitState === 'loading')
  if (workerError) {
    pass = false
    blockers.push(`worker init stuck/error (${workerError.workerInitState})`)
  }

  if (y100.milestones.microPop <= 0 && y100.milestones.microUnits < 1) {
    pass = false
    blockers.push(`@~100: no microbes in snapshot (actual yr ${y100.actualYear.toFixed(1)})`)
  }
  if (y200.milestones.producerSpecies < 1) {
    pass = false
    blockers.push(`@~200: no producers in snapshot (actual yr ${y200.actualYear.toFixed(1)})`)
  }
  if (y400.milestones.mobileAgents < 1 && y400.milestones.mobilePop < 10) {
    pass = false
    blockers.push(`@~400: no animals/mobile in snapshot (actual yr ${y400.actualYear.toFixed(1)})`)
  }

  const visibleAt = (row: SampleRow) => {
    const drawn =
      Number(row.perf.renderedMovingGlyphs ?? 0) +
      Number(row.perf.renderedProducerGlyphs ?? 0) +
      Number(row.perf.renderedStaticMarkers ?? 0)
    const agg = Number(row.perf.showcaseAggregateTiles ?? 0) + Number(row.perf.showcaseAggregateMarkers ?? 0)
    return drawn + agg
  }

  if (visibleAt(y100) < 1 && (y100.milestones.microPop > 0 || y100.milestones.microUnits > 0)) {
    pass = false
    blockers.push(`@~100: sim has microbes but zero render/aggregate visuals`)
  }
  if (visibleAt(y200) < 1 && y200.milestones.producerSpecies > 0) {
    pass = false
    blockers.push(`@~200: sim has producers but zero render/aggregate visuals`)
  }
  if (visibleAt(y400) < 1 && (y400.milestones.mobileAgents > 0 || y400.milestones.mobilePop >= 10)) {
    pass = false
    blockers.push(`@~400: sim has mobile life but zero render/aggregate visuals`)
  }

  const cand400 = Number(y400.perf.candidateMovingGlyphs ?? 0)
  if (y400.milestones.mobileAgents > 0 && cand400 <= 0) {
    pass = false
    blockers.push(`@~400: agents exist but glyph candidate count is 0`)
  }

  const maxRender = Math.max(...samples.map((s) => Number(s.perf.renderMsLastFrame ?? 0)))
  if (maxRender > 250) {
    pass = false
    blockers.push(`render spike ${maxRender.toFixed(0)}ms (target ≤250 sustained)`)
  }

  const rafBad = samples.some((s) => Number(s.perf.rafLoopCount ?? 0) !== 1)
  if (rafBad) {
    pass = false
    blockers.push('RAF loop count ≠ 1 (duplicate viewport/runtime loops)')
  }

  console.log(`\nqa:arcade-browser-gate — ${pass ? 'PASS' : 'FAIL'}`)
  if (blockers.length) console.log(' ', blockers.join('; '))
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('qa:arcade-browser-gate — ERROR', err)
  process.exit(2)
})
