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
  const workerMode = useSimulationStore((s) => s.workerMode)

  const warnings = perf.soakWarnings

  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/70 p-2 font-mono text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-cyan-400">SOAK HUD</span>
        <span>yr {perf.simulatedYearDisplay.toFixed(1)}</span>
        <span>{perf.runtimeSeconds.toFixed(0)}s wall</span>
        <span>cam {cameraModeLabel(runtime.cameraMode)}</span>
        {workerMode && <span className="text-emerald-500">worker×{perf.workerInstanceCount}</span>}
        <span className={perf.crashRiskLevel === 'low' ? 'text-emerald-500' : perf.crashRiskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'}>
          risk {perf.crashRiskLevel}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 sm:grid-cols-4">
        <span>heap {perf.heapEstimateMb ?? '—'} MB</span>
        <span>trend {perf.heapTrendMbPerMin ?? '—'} MB/m</span>
        <span>snap {Math.round(perf.snapshotBytesEstimate / 1024)} KB</span>
        <span>pending {perf.pendingSnapshots}</span>
        <span>drop {perf.snapshotsDropped}</span>
        <span>snap/s {perf.snapshotsPerSec.toFixed(1)}</span>
        <span>msg/s {perf.workerMessagesPerSec.toFixed(1)}</span>
        <span>events {perf.eventCount}</span>
        <span>dev {perf.developmentCount}</span>
        <span>gfx {perf.pixiGraphicsCount}</span>
        <span>ctr {perf.pixiContainerCount}</span>
        <span>rt {perf.renderTextureCount}</span>
        <span>terrain₵ {perf.terrainCacheSize}</span>
        <span>glyph₵ {perf.glyphCacheSize}</span>
        <span>org {perf.organismCapUsagePct}%</span>
        <span>agents {perf.agentCountDisplay}</span>
        <span>species {perf.speciesCountDisplay}</span>
        <span>tile↑ {perf.maxTileLoad}/{perf.maxTileAgents}</span>
        <span>Δbirth {perf.organismBirthsLastInterval}</span>
        <span>Δdeath {perf.organismDeathsLastInterval}</span>
        <span>RAF {perf.rafLoopCount}</span>
        <span>cam/s {perf.cameraUpdatesPerSec.toFixed(1)}</span>
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
