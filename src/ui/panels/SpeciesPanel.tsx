import { useSimulationStore } from '../../store/simulationStore'
import { lifeKindLabel } from '../viewport/tileColors'

export function SpeciesPanel() {
  const life = useSimulationStore((s) => s.snapshot.life)
  const tick = useSimulationStore((s) => s.snapshot.tick)

  if (life.totalOrganisms === 0) {
    return (
      <p className="text-sm text-slate-400">
        No living organisms yet. Step the simulation or generate a world with suitable
        hydrothermal, aquatic, and fertile land tiles.
      </p>
    )
  }

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <dl className="space-y-1.5 font-mono text-xs">
        <Row label="Tick" value={String(tick)} />
        <Row label="Total organisms" value={String(life.totalOrganisms)} />
        <Row label="Total biomass" value={life.totalBiomass.toFixed(1)} />
        <Row label="Species count" value={String(life.species.length)} />
      </dl>

      <div>
        <p className="mb-2 font-mono text-xs text-slate-500">SPECIES REGISTRY</p>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {life.species.map((species) => (
            <li
              key={species.id}
              className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs"
            >
              <div className="flex justify-between gap-2">
                <span className="text-command-accent">{species.name}</span>
                <span className="text-slate-500">{species.population}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-400">
                <span>{lifeKindLabel(species.kind)}</span>
                <span>bio {species.totalBiomass.toFixed(1)}</span>
              </div>
              {species.ancestorSpeciesId && (
                <p className="mt-1 text-slate-500">gen {species.generation} · mutated lineage</p>
              )}
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
