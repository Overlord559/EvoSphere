import { useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import {
  computeWorldStats,
  formatPercent,
  formatTemperature,
  sortTerrainDistribution,
} from '../../simulation/world'
import { terrainLabel } from '../viewport/tileColors'

export function WorldPanel() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const settings = useSimulationStore((s) => s.settings)
  const newWorldFromSeed = useSimulationStore((s) => s.newWorldFromSeed)
  const newWorldRandomSeed = useSimulationStore((s) => s.newWorldRandomSeed)
  const resetWorld = useSimulationStore((s) => s.resetWorld)
  const stepSimulation = useSimulationStore((s) => s.stepSimulation)

  const [seedInput, setSeedInput] = useState(settings.seed)
  const world = snapshot.world
  const life = snapshot.life
  const stats = computeWorldStats(world)

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <div className="space-y-2">
        <label className="block font-mono text-xs text-slate-500" htmlFor="world-seed">
          SEED
        </label>
        <div className="flex gap-2">
          <input
            id="world-seed"
            type="text"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-command-border bg-command-bg px-2 py-1.5 font-mono text-xs text-slate-200"
          />
          <button
            type="button"
            onClick={() => newWorldFromSeed(seedInput)}
            className="rounded border border-command-accent/40 px-2 py-1.5 font-mono text-xs text-command-accent hover:bg-command-accent/10"
          >
            Generate
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={newWorldRandomSeed}
            className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200"
          >
            Random seed
          </button>
          <button
            type="button"
            onClick={resetWorld}
            className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={stepSimulation}
            className="rounded border border-command-accent/30 px-2 py-1 font-mono text-xs text-command-accent hover:bg-command-accent/10"
          >
            Step tick
          </button>
          <button
            type="button"
            onClick={() => {
              for (let i = 0; i < 10; i++) stepSimulation()
            }}
            className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200"
          >
            Step ×10
          </button>
        </div>
      </div>

      <dl className="space-y-1.5 font-mono text-xs">
        <Row label="Active seed" value={world.seed} />
        <Row label="Dimensions" value={`${world.width} × ${world.height}`} />
        <Row label="Tick" value={String(snapshot.tick)} />
        <Row label="Tile count" value={String(stats.tileCount)} />
        <Row label="Total life" value={String(life.totalOrganisms)} />
        <Row label="Total biomass" value={life.totalBiomass.toFixed(1)} />
        <Row label="Species" value={String(life.species.length)} />
        <Row label="Avg temperature" value={formatTemperature(stats.averageTemperature)} />
        <Row label="Avg moisture" value={formatPercent(stats.averageMoisture)} />
        <Row label="Water coverage" value={`${stats.waterCoveragePercent.toFixed(1)}%`} />
      </dl>

      <div>
        <p className="mb-2 font-mono text-xs text-slate-500">TERRAIN DISTRIBUTION</p>
        <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-slate-400">
          {sortTerrainDistribution(stats.terrainDistribution).map(([terrain, count]) => (
            <li key={terrain} className="flex justify-between gap-2">
              <span>{terrainLabel(terrain)}</span>
              <span>{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-300">{value}</dd>
    </div>
  )
}
