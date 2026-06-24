import { useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import type { SimSpeed } from '../../types/runtime'
import { formatSimYears, buildSimTimeDisplay } from '../../simulation/engine/simTime'

const SPEEDS: { id: Exclude<SimSpeed, 'deep'>; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'smooth playback' },
  { id: 'fast', label: 'Fast Forward', hint: '8× steps/frame' },
  { id: 'superfast', label: 'Super Fast', hint: '30× steps/frame' },
  { id: 'ultrafast', label: 'Ultra Fast', hint: '100× steps/frame' },
]

const DEEP_TIME_JUMPS = [
  { years: 10, label: '+10 yr', hint: 'quick' },
  { years: 100, label: '+100 yr', hint: 'fast' },
  { years: 1_000, label: '+1K yr', hint: '~15–25s' },
  { years: 10_000, label: '+10K yr', hint: 'long-running' },
  { years: 100_000, label: '+100K yr', hint: 'minutes' },
  { years: 1_000_000, label: '+1M yr', hint: 'very slow' },
]

export function SimulationControls() {
  const runtime = useSimulationStore((s) => s.runtime)
  const visualMode = useSimulationStore((s) => s.visualMode)
  const deepTimeRunning = useSimulationStore((s) => s.deepTimeRunning)
  const deepTimeProgress = useSimulationStore((s) => s.deepTimeProgress)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const stepSimulation = useSimulationStore((s) => s.stepSimulation)
  const setSpeed = useSimulationStore((s) => s.setSpeed)
  const deepTimeYears = useSimulationStore((s) => s.deepTimeYears)
  const cancelDeepTime = useSimulationStore((s) => s.cancelDeepTime)
  const resetWorld = useSimulationStore((s) => s.resetWorld)
  const newWorldRandomSeed = useSimulationStore((s) => s.newWorldRandomSeed)

  const [debugOpen, setDebugOpen] = useState(false)
  const simTime = buildSimTimeDisplay(
    snapshot.tick,
    snapshot.life,
    snapshot.agents,
    runtime.speed,
  )
  const isRunning = runtime.isRunning

  const progressPct = deepTimeProgress
    ? Math.min(100, Math.round((deepTimeProgress.completedTicks / deepTimeProgress.totalTicks) * 100))
    : 0

  return (
    <div className="space-y-3">
      <div className="rounded border border-command-accent/20 bg-command-accent/5 p-3">
        <p className="font-mono text-[10px] text-command-accent">SIMULATED TIME</p>
        <p className="mt-1 font-mono text-lg text-slate-100">
          {formatSimYears(simTime.simulatedYear)}
        </p>
        <p className="font-mono text-xs text-slate-400">
          {simTime.eraLabel} · Gen ~{simTime.generationEstimate}
        </p>
        {visualMode === 'debug' && (
          <p className="mt-1 font-mono text-[10px] text-slate-600">
            internal tick {simTime.internalTick}
          </p>
        )}
        {isRunning && !deepTimeRunning && (
          <span className="mt-2 inline-block rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            {simTime.speedLabel} · LIVE
          </span>
        )}
      </div>

      {deepTimeProgress && (
        <div className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs text-amber-300">Deep Time — Exact Simulation</p>
            <button
              type="button"
              onClick={cancelDeepTime}
              className="rounded border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] text-amber-200 hover:bg-amber-500/10"
            >
              Cancel
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full bg-amber-400 transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="font-mono text-[10px] text-slate-400">
            Year {formatSimYears(deepTimeProgress.currentYear)} of{' '}
            {formatSimYears(deepTimeProgress.targetYear)} · {progressPct}% ·{' '}
            {(deepTimeProgress.elapsedMs / 1000).toFixed(1)}s elapsed
            {deepTimeProgress.estimatedRemainingMs != null && (
              <> · ~{(deepTimeProgress.estimatedRemainingMs / 1000).toFixed(0)}s remaining</>
            )}
          </p>
          <p className="font-mono text-[10px] text-amber-500/80">
            Long-running exact mode — may take minutes for +100K / +1M years
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isRunning ? (
          <ControlButton accent onClick={pause}>
            Pause
          </ControlButton>
        ) : (
          <ControlButton accent onClick={play} disabled={deepTimeRunning}>
            Play
          </ControlButton>
        )}
        <ControlButton onClick={resetWorld} disabled={isRunning || deepTimeRunning}>
          Reset World
        </ControlButton>
        <ControlButton onClick={newWorldRandomSeed} disabled={isRunning || deepTimeRunning}>
          Random World
        </ControlButton>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-xs text-slate-500">PLAYBACK SPEED</p>
        <div className="flex flex-wrap gap-1">
          {SPEEDS.map(({ id, label, hint }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSpeed(id)
                if (!isRunning && !deepTimeRunning) play()
              }}
              aria-pressed={runtime.speed === id}
              disabled={deepTimeRunning}
              title={hint}
              className={`rounded px-2 py-1 font-mono text-xs transition-colors disabled:opacity-40 ${
                runtime.speed === id
                  ? 'bg-command-accent/15 text-command-accent'
                  : 'border border-command-border text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-xs text-slate-500">DEEP TIME (exact years, chunked)</p>
        <div className="flex flex-wrap gap-1">
          {DEEP_TIME_JUMPS.map(({ years, label, hint }) => (
            <button
              key={years}
              type="button"
              onClick={() => deepTimeYears(years)}
              disabled={isRunning || deepTimeRunning}
              title={`Advance ${years} simulated years — ${hint}`}
              className="rounded border border-amber-500/30 px-2 py-1 font-mono text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {label}
              <span className="ml-1 text-[10px] text-amber-500/70">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {(visualMode === 'debug' || debugOpen) && (
        <div className="rounded border border-slate-700 bg-slate-900/50 p-2">
          {visualMode !== 'debug' && (
            <button
              type="button"
              onClick={() => setDebugOpen(!debugOpen)}
              className="mb-2 font-mono text-[10px] text-slate-500 hover:text-slate-300"
            >
              {debugOpen ? '▼' : '▶'} Advanced / Debug Controls
            </button>
          )}
          {(visualMode === 'debug' || debugOpen) && (
            <div className="flex flex-wrap gap-2">
              <ControlButton onClick={() => stepSimulation(1)} disabled={isRunning || deepTimeRunning}>
                +1 internal step
              </ControlButton>
              <ControlButton onClick={() => stepSimulation(10)} disabled={isRunning || deepTimeRunning}>
                +10 steps
              </ControlButton>
              <ControlButton onClick={() => stepSimulation(100)} disabled={isRunning || deepTimeRunning}>
                +100 steps
              </ControlButton>
              <span className="self-center font-mono text-[10px] text-slate-600">
                tick {snapshot.tick}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ControlButton({
  children,
  onClick,
  accent,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  accent?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-40 ${
        accent
          ? 'border-command-accent/40 text-command-accent hover:bg-command-accent/10'
          : 'border-command-border text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
