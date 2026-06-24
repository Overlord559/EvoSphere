import { useSimulationStore } from '../../store/simulationStore'

export function PerformanceDebugTable() {
  const report = useSimulationStore((s) => s.performanceReport)
  const workerMode = useSimulationStore((s) => s.workerMode)
  const workerFallbackReason = useSimulationStore((s) => s.workerFallbackReason)
  const perf = useSimulationStore((s) => s.runtime.performance)

  if (!report) return null

  return (
    <div className="rounded border border-slate-700/60 bg-slate-900/40 p-2 font-mono text-[10px] text-slate-400">
      <p className="text-command-accent">
        PERF {workerMode ? '· WORKER' : '· MAIN'}
        {workerFallbackReason ? ` · fallback: ${workerFallbackReason}` : ''}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>FPS ~{perf.fpsEstimate}</span>
        <span>sim {perf.simMsPerFrame.toFixed(1)} ms/frame</span>
        <span>{report.simTicksPerSec.toFixed(0)} ticks/s</span>
        <span>{report.snapshotsPerSec.toFixed(1)} snapshots/s</span>
        <span>{report.workerMessagesPerSec.toFixed(1)} worker msg/s</span>
        <span>events {report.eventsRetained}</span>
        <span>drawn tiles {perf.drawnTiles}</span>
        <span>drawn agents {perf.drawnAgents}</span>
        <span>Pixi gfx {perf.pixiGraphicsCount}</span>
        <span>pending snap {perf.pendingSnapshots}</span>
        <span>snap ~{(perf.snapshotBytesEstimate / 1024).toFixed(0)} KB</span>
        <span>cap {perf.organismCapUsagePct}%</span>
        <span>max tile {perf.maxTileLoad}</span>
        <span>risk {perf.crashRiskLevel}</span>
        {perf.heapEstimateMb !== null && <span>heap ~{perf.heapEstimateMb} MB</span>}
      </div>
      {report.topBottlenecks.length > 0 && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-500">
              <th>subsystem</th>
              <th>avg ms</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {report.topBottlenecks.map((b) => (
              <tr key={b.category}>
                <td>{b.category}</td>
                <td>{b.avgMs.toFixed(2)}</td>
                <td>{b.pctOfTotal.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1 text-slate-600">
        sim {report.simulationMs.toFixed(0)} ms · render {report.renderMs.toFixed(0)} ms · main{' '}
        {report.mainThreadMs.toFixed(0)} ms (window)
      </p>
    </div>
  )
}
