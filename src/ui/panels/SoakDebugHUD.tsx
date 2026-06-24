import { useSimulationStore } from '../../store/simulationStore'
import { cameraModeLabel } from '../viewport/cameraController'

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
  const workerDisasterSyncTick = useSimulationStore((s) => s.workerDisasterSyncTick)

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

  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/70 p-2 font-mono text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-cyan-400">SOAK HUD</span>
        <span>tick {runtime.internalTick}</span>
        <span>yr {perf.simulatedYearDisplay.toFixed(1)}</span>
        <span>fps {perf.fpsEstimate.toFixed(0)}</span>
        <span>{perf.runtimeSeconds.toFixed(0)}s wall</span>
        <span className="text-violet-300">{simPath}</span>
        {workerMode && <span className="text-emerald-500">worker×{perf.workerInstanceCount}</span>}
        <span>cam {cameraModeLabel(runtime.cameraMode)}</span>
        <span className={perf.crashRiskLevel === 'low' ? 'text-emerald-500' : perf.crashRiskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'}>
          risk {perf.crashRiskLevel}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 sm:grid-cols-4 lg:grid-cols-6">
        <span>heap {perf.heapEstimateMb ?? '—'} MB</span>
        <span>trend {perf.heapTrendMbPerMin ?? '—'} MB/m</span>
        <span>orgs {snapshot.life.totalOrganisms}+{snapshot.life.aggregateOrganisms}</span>
        <span>agents {snapshot.agents.totalAgents}+{snapshot.agents.populationReserve}</span>
        <span>bio {snapshot.life.totalBiologicalPopulation + snapshot.agents.totalMobilePopulation}</span>
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
        <span>cam/s {perf.cameraUpdatesPerSec.toFixed(1)}</span>
        {workerDisasterSyncTick != null && (
          <span className="text-emerald-400">dis-sync @{workerDisasterSyncTick}</span>
        )}
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
