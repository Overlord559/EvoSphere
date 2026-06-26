import { useSimulationStore } from '../../store/simulationStore'
import { formatEstimatedPopulation } from '../../simulation/ecology/representationScale'
import { cameraModeLabel } from '../viewport/cameraController'
import { hudMilestoneMetrics } from './hudMilestoneMetrics'

const SEVERITY_CLASS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-amber-300',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

export function SoakDebugHUD() {
  const perf = useSimulationStore((s) => s.runtime.performance)
  const runtime = useSimulationStore((s) => s.runtime)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const workerMode = useSimulationStore((s) => s.workerMode)
  const workerInitState = useSimulationStore((s) => s.workerInitState)
  const workerFallbackReason = useSimulationStore((s) => s.workerFallbackReason)
  const workerDisasterSyncTick = useSimulationStore((s) => s.workerDisasterSyncTick)
  const screenshotMode = useSimulationStore((s) => s.screenshotMode)
  const soakHudExpanded = useSimulationStore((s) => s.soakHudExpanded)
  const setSoakHudExpanded = useSimulationStore((s) => s.setSoakHudExpanded)
  const renderPipeline = useSimulationStore((s) => s.renderPipeline)

  const warnings = perf.soakWarnings
  const species = snapshot.life.species
  const aliveSpecies = species.filter((s) => s.population > 0)
  const variants = species.filter((s) => s.taxonRank === 'variant' && s.establishmentStatus !== 'failed').length
  const subspecies = species.filter((s) => s.taxonRank === 'subspecies' && s.population > 0).length
  const stableSpecies = species.filter(
    (s) => s.population > 0 && (s.taxonRank === 'species' || s.taxonRank === 'subspecies' || s.isFounderLineage),
  ).length
  const succession = snapshot.briefing.successionOverview
  const popArch = snapshot.briefing.populationArchitecture
  const rep = snapshot.life.representationMetrics
  const estBio = snapshot.life.totalBiologicalPopulation + snapshot.agents.totalMobilePopulation
  const bioticPct = succession
    ? Math.round(
        succession.grasslandPercent +
          succession.forestPercent +
          succession.swampMarshPercent +
          succession.pioneerPercent +
          succession.algalPercent +
          succession.microbialPercent,
      )
    : null
  const activeDisasters = snapshot.disasters?.active.length ?? 0
  const safeMode = snapshot.disasters?.settings?.disasterSafeMode ?? true
  const simPath = workerMode ? 'worker' : 'main'
  const era = snapshot.eraDirector
  const civ = snapshot.civilization
  const clades = snapshot.sapientClades
  const reseed = snapshot.reseedState
  const milestones = hudMilestoneMetrics(snapshot)
  const microbialSpecies = species.filter(
    (s) =>
      s.population > 0 &&
      ['Microbe', 'PhotosyntheticMicrobe', 'ChemosyntheticMicrobe'].includes(s.kind as string),
  )
  const photoMicro = species.filter((s) => s.population > 0 && s.kind === 'PhotosyntheticMicrobe')
  const chemMicro = species.filter((s) => s.population > 0 && s.kind === 'ChemosyntheticMicrobe')
  const algaePop = species.filter((s) => s.population > 0 && s.kind === 'Algae').reduce((n, s) => n + s.population, 0)
  const microPop = microbialSpecies.reduce((n, s) => n + s.population, 0)
  const microDelta = microbialSpecies.reduce((n, s) => n + (s.populationDelta ?? 0), 0)
  const photoDelta = photoMicro.reduce((n, s) => n + (s.biomassDelta ?? 0), 0)
  const strainCount = species.filter((s) => s.taxonRank === 'variant' && s.population > 0).length
  const growthStatus = era?.layerGrowthStatus ?? '—'
  const growthBlock = era?.eraBlockReason ?? 'none'

  if (screenshotMode && !soakHudExpanded) {
    return (
      <button
        type="button"
        onClick={() => setSoakHudExpanded(true)}
        className="w-full rounded border border-slate-700/50 bg-slate-950/60 px-2 py-1 text-left font-mono text-[10px] text-slate-500 hover:text-slate-300"
      >
        Soak HUD (collapsed) · RAF {perf.rafLoopCount} · heap {perf.heapEstimateMb ?? '—'} MB · expand
      </button>
    )
  }

  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/70 p-2 font-mono text-[10px] text-slate-400">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-cyan-400">SOAK HUD</span>
        {screenshotMode && (
          <button
            type="button"
            onClick={() => setSoakHudExpanded(false)}
            className="rounded border border-slate-600 px-1 py-0.5 text-[9px] text-slate-500 hover:text-slate-300"
          >
            collapse
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>tick {runtime.internalTick}</span>
        <span>yr {perf.simulatedYearDisplay.toFixed(1)}</span>
        <span>fps {perf.fpsEstimate.toFixed(0)}</span>
        <span>{perf.runtimeSeconds.toFixed(0)}s wall</span>
        <span className="text-violet-300">{simPath}</span>
        <span className={workerInitState === 'ready' ? 'text-emerald-500' : workerInitState === 'error' ? 'text-red-400' : 'text-amber-400'}>
          wk {workerInitState}
        </span>
        {workerFallbackReason && (
          <span className="text-amber-400" title={workerFallbackReason}>
            fallback
          </span>
        )}
        {workerMode && <span className="text-emerald-500">worker×{perf.workerInstanceCount}</span>}
        <span>cam {cameraModeLabel(runtime.cameraMode)}</span>
        <span className={perf.crashRiskLevel === 'low' ? 'text-emerald-500' : perf.crashRiskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'}>
          risk {perf.crashRiskLevel}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 sm:grid-cols-4 lg:grid-cols-6">
        <span>heap {perf.heapEstimateMb ?? '—'} MB</span>
        <span>trend {perf.heapTrendMbPerMin ?? '—'} MB/m</span>
        <span>est {formatEstimatedPopulation(estBio)}</span>
        <span>units {rep?.populationUnitsCount ?? 0}</span>
        <span>tracked {snapshot.life.totalOrganisms}+{snapshot.agents.totalAgents}</span>
        <span>render {perf.renderedMovingGlyphs}/{perf.maxMovingGlyphCap}</span>
        <span>static {perf.renderedStaticMarkers ?? 0}</span>
        <span>prod {perf.renderedProducerGlyphs}/{perf.maxProducerGlyphCap}</span>
        <span>skip {perf.skippedGlyphs}</span>
        {perf.densityOnlyMode && <span className="text-cyan-400">density-only</span>}
        <span>marked {perf.livingSpeciesMarked ?? '—'} sp</span>
        <span>cohort {perf.visibleCohortCount}</span>
        <span>compress {rep?.compressionRatio ?? 0}×</span>
        <span>orgs {snapshot.life.totalOrganisms}+{formatEstimatedPopulation(snapshot.life.aggregateOrganisms)}</span>
        <span>agents {snapshot.agents.totalAgents}+{formatEstimatedPopulation(snapshot.agents.populationReserve)}</span>
        <span>cap {popArch?.capacityPressurePct ?? perf.organismCapUsagePct}%</span>
        <span>exp {popArch?.expansionPressurePct ?? '—'}%</span>
        {popArch?.artificialCapEngaged && <span className="text-amber-400">repr-cap</span>}
        <span>sp {stableSpecies}/{aliveSpecies.length}</span>
        <span>var {variants} sub {subspecies}</span>
        <span>succ {bioticPct ?? '—'}%</span>
        <span>dis {activeDisasters}{safeMode ? ' safe' : ''}</span>
        <span>events {perf.eventCount}</span>
        <span>dev {perf.developmentCount}</span>
        <span>snap {Math.round(perf.snapshotBytesEstimate / 1024)} KB</span>
        <span>pending {perf.pendingSnapshots}</span>
        <span>drop {perf.snapshotsDropped}</span>
        <span>snap/s {perf.snapshotsPerSec.toFixed(1)}</span>
        <span>msg/s {perf.workerMessagesPerSec.toFixed(1)}</span>
        <span>sim {perf.simMsPerFrame.toFixed(1)} ms</span>
        <span>render {perf.renderMsLastFrame?.toFixed(1) ?? '—'} ms</span>
        <span className="text-cyan-300">Q {perf.renderQualityTier ?? 'balanced'}</span>
        <span>gfx {perf.pixiGraphicsCount}</span>
        <span>ctr {perf.pixiContainerCount}</span>
        <span>rt {perf.renderTextureCount}</span>
        <span>terrain₵ {perf.terrainCacheSize}</span>
        <span>glyph₵ {perf.glyphCacheSize}</span>
        <span>org {perf.organismCapUsagePct}%</span>
        <span>tile↑ {perf.maxTileLoad}/{perf.maxTileAgents}</span>
        <span>Δbirth {perf.organismBirthsLastInterval}</span>
        <span>Δdeath {perf.organismDeathsLastInterval}</span>
        <span>RAF {perf.rafLoopCount}</span>
        <span>mode {perf.renderPipelineDisplay ?? renderPipeline}</span>
        {(perf.marker3dCount ?? 0) > 0 && <span>3D mk {perf.marker3dCount}</span>}
        {(perf.mesh3dCount ?? 0) > 0 && <span>3D mesh {perf.mesh3dCount}</span>}
        <span className="text-cyan-400">
          kernel{' '}
          {perf.kernelBackend === 'wasm'
            ? 'WASM active'
            : perf.kernelBackend === 'wasm-fallback'
              ? 'WASM unavailable, TS fallback'
              : 'TS'}
        </span>
        <span>cam/s {perf.cameraUpdatesPerSec.toFixed(1)}</span>
        {workerDisasterSyncTick != null && (
          <span className="text-emerald-400">dis-sync @{workerDisasterSyncTick}</span>
        )}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 border-t border-slate-800/80 pt-1 sm:grid-cols-4 lg:grid-cols-6">
        <span className="text-violet-300">era {era?.focusLayer ?? '—'}</span>
        <span>bio {snapshot.biosphereState}</span>
        <span>micro {formatEstimatedPopulation(microPop)}</span>
        <span>photo {formatEstimatedPopulation(photoMicro.reduce((n, s) => n + s.population, 0))}</span>
        <span>chem {formatEstimatedPopulation(chemMicro.reduce((n, s) => n + s.population, 0))}</span>
        <span>algae {formatEstimatedPopulation(algaePop)}</span>
        <span className="text-emerald-400">
          prod {milestones.producerSpecies}sp/{formatEstimatedPopulation(milestones.producerPop)}
        </span>
        <span className="text-amber-300">
          mobile {milestones.mobileAgents}+{formatEstimatedPopulation(milestones.mobilePop)} r{formatEstimatedPopulation(milestones.mobileReserve)} c{milestones.mobileCohorts}
        </span>
        <span>Δpop {formatEstimatedPopulation(microDelta)}</span>
        <span>Δphoto {photoDelta.toFixed(2)}</span>
        <span>O₂ {era?.backgroundBiosphere.atmosphericOxygenPct.toFixed(1) ?? '—'}%</span>
        <span>ocean O₂ {era?.backgroundBiosphere.oceanOxygenPct.toFixed(1) ?? '—'}%</span>
        <span>strains {strainCount}</span>
        <span className={growthStatus === 'growing' ? 'text-emerald-400' : growthStatus === 'blocked' ? 'text-amber-400' : ''}>
          growth {growthStatus}
        </span>
        <span className="truncate" title={growthBlock}>block {growthBlock.slice(0, 24)}</span>
        <span>clades {clades?.clades.length ?? 0}</span>
        <span>factions {civ?.factions.length ?? 0}</span>
        <span>settlements {civ?.settlements.length ?? 0}</span>
        <span>reseed {reseed?.lastReseedConfirmed ? reseed.lastReseedMode ?? 'yes' : '—'}</span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 border-t border-slate-800/80 pt-1 sm:grid-cols-4 lg:grid-cols-6">
        <span className="col-span-full text-cyan-400">VISIBILITY BRIDGE</span>
        <span>micro sp {milestones.microSpecies} u {milestones.microUnits}</span>
        <span>prod {milestones.producerSpecies}sp</span>
        <span>agents {milestones.mobileAgents}</span>
        <span>mobile {formatEstimatedPopulation(milestones.mobilePop)}</span>
        <span>cohorts {milestones.mobileCohorts}</span>
        <span>units {snapshot.life.populationUnits.length}</span>
        <span>cand {perf.candidateMovingGlyphs ?? 0}+{perf.candidateProducerGlyphs ?? 0}</span>
        <span>draw {perf.renderedMovingGlyphs}+{perf.renderedProducerGlyphs}</span>
        <span>skip m/p/s {(perf.skippedMovingGlyphs ?? 0)}/{(perf.skippedProducerGlyphs ?? 0)}/{(perf.skippedStaticMarkers ?? 0)}</span>
        <span>agg {perf.showcaseAggregateTiles ?? 0}t {perf.showcaseAggregateMarkers ?? 0}mk</span>
        {perf.densityOnlyMode && <span className="text-cyan-400">density-only</span>}
      </div>
      {warnings.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-slate-800 pt-1">
          {warnings.map((w) => (
            <li key={w.code} className={SEVERITY_CLASS[w.severity] ?? 'text-slate-400'}>
              ⚠ {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
