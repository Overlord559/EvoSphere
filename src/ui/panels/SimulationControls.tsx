import { useSimulationStore } from '../../store/simulationStore'
import type { SimSpeed } from '../../types/runtime'
import { formatSimYears } from '../../simulation/engine/simTime'

const SPEEDS: { id: SimSpeed; label: string }[] = [
  { id: 1, label: '1×' },
  { id: 10, label: '10×' },
  { id: 100, label: '100×' },
  { id: 1000, label: '1000×' },
  { id: 'deep', label: 'Deep Time' },
]

const DEEP_TIME_JUMPS = [
  { years: 1_000, label: '+1K yr' },
  { years: 10_000, label: '+10K yr' },
  { years: 100_000, label: '+100K yr' },
  { years: 1_000_000, label: '+1M yr' },
]

export function SimulationControls() {
  const runtime = useSimulationStore((s) => s.runtime)
  const deepTimeRunning = useSimulationStore((s) => s.deepTimeRunning)
  const tick = useSimulationStore((s) => s.snapshot.tick)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const stepSimulation = useSimulationStore((s) => s.stepSimulation)
  const setSpeed = useSimulationStore((s) => s.setSpeed)
  const deepTimeYears = useSimulationStore((s) => s.deepTimeYears)
  const resetWorld = useSimulationStore((s) => s.resetWorld)
  const newWorldRandomSeed = useSimulationStore((s) => s.newWorldRandomSeed)

  const isRunning = runtime.isRunning

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">RUNTIME</span>
        <span className="font-mono text-xs text-command-accent">
          tick {tick} · {formatSimYears(Math.floor(tick / 10))}
        </span>
        {isRunning && !deepTimeRunning && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
            RUNNING {runtime.speed === 'deep' ? 'DEEP' : `${runtime.speed}×`}
          </span>
        )}
        {deepTimeRunning && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
            DEEP TIME…
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isRunning ? (
          <ControlButton accent onClick={pause}>
            Pause
          </ControlButton>
        ) : (
          <ControlButton accent onClick={play} disabled={deepTimeRunning}>
            Run
          </ControlButton>
        )}
        <ControlButton onClick={() => stepSimulation(1)} disabled={isRunning || deepTimeRunning}>
          Step 1
        </ControlButton>
        <ControlButton onClick={() => stepSimulation(10)} disabled={isRunning || deepTimeRunning}>
          Step 10
        </ControlButton>
        <ControlButton onClick={() => stepSimulation(100)} disabled={isRunning || deepTimeRunning}>
          Step 100
        </ControlButton>
        <ControlButton onClick={() => stepSimulation(1000)} disabled={isRunning || deepTimeRunning}>
          Step 1K
        </ControlButton>
        <ControlButton onClick={resetWorld} disabled={isRunning || deepTimeRunning}>
          Reset
        </ControlButton>
        <ControlButton onClick={newWorldRandomSeed} disabled={isRunning || deepTimeRunning}>
          Random seed
        </ControlButton>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-xs text-slate-500">SPEED</p>
        <div className="flex flex-wrap gap-1">
          {SPEEDS.map(({ id, label }) => (
            <button
              key={String(id)}
              type="button"
              onClick={() => setSpeed(id)}
              aria-pressed={runtime.speed === id}
              className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
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
        <p className="mb-1.5 font-mono text-xs text-slate-500">DEEP TIME</p>
        <div className="flex flex-wrap gap-1">
          {DEEP_TIME_JUMPS.map(({ years, label }) => (
            <button
              key={years}
              type="button"
              onClick={() => deepTimeYears(years)}
              disabled={isRunning || deepTimeRunning}
              className="rounded border border-amber-500/30 px-2 py-1 font-mono text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
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
