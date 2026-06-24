import { useSimulationStore } from '../../store/simulationStore'
import { formatSimYears } from '../../simulation/engine/simTime'
import { lifeKindLabel } from '../viewport/tileColors'

export function BriefingPanel() {
  const briefing = useSimulationStore((s) => s.snapshot.briefing)
  const tick = useSimulationStore((s) => s.snapshot.tick)
  const deep = briefing.latestDeepTimeSummary
  const selected = briefing.selectedSpecies

  return (
    <div className="space-y-4 text-sm text-slate-300">
      {selected ? (
        <div className="rounded border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="font-mono text-xs text-violet-300">SELECTED SPECIES BRIEFING</p>
          <p className="mt-2 font-mono text-lg text-slate-100">{selected.name}</p>
          <p className="font-mono text-xs text-slate-400">{lifeKindLabel(selected.kind)} · {selected.trend}</p>
          <dl className="mt-3 space-y-1.5 font-mono text-xs">
            <Row label="Population" value={String(selected.population)} />
            <Row label="Biomass" value={selected.biomass.toFixed(1)} />
            <Row label="Occupied tiles" value={String(selected.occupiedTiles)} />
            <Row label="Avg generation" value={selected.avgGeneration.toFixed(1)} />
            <Row label="Avg energy" value={selected.avgEnergy.toFixed(2)} />
            <Row label="Avg health" value={selected.avgHealth.toFixed(2)} />
            <Row label="Dominant habitat" value={selected.dominantTerrain ?? '—'} />
            <Row
              label="Recent trend"
              value={`${selected.popDelta >= 0 ? '+' : ''}${selected.popDelta} pop`}
            />
          </dl>
        </div>
      ) : (
        <div className="rounded border border-command-accent/20 bg-command-accent/5 p-3">
          <p className="font-mono text-xs text-command-accent">WORLD BRIEFING</p>
          <p className="mt-2 text-lg font-mono text-slate-100">
            Year {formatSimYears(briefing.simulatedYear)}
          </p>
          <p className="font-mono text-xs text-slate-400">
            Tick {tick} · ~{briefing.estimatedGenerations} gen · {briefing.era}
          </p>
        </div>
      )}

      {!selected && (
        <dl className="space-y-1.5 font-mono text-xs">
          <Row label="Era" value={briefing.era} />
          <Row label="Organisms" value={String(briefing.totalOrganisms)} />
          <Row label="Biomass" value={briefing.totalBiomass.toFixed(1)} />
          <Row label="Species (alive)" value={String(briefing.speciesCount)} />
          <Row
            label="Dominant kind"
            value={briefing.dominantKind ? lifeKindLabel(briefing.dominantKind) : '—'}
          />
          <Row label="Dominant species" value={briefing.dominantSpeciesName ?? '—'} />
          <Row label="Fastest growing" value={briefing.fastestGrowingSpecies ?? '—'} />
          <Row label="Most threatened" value={briefing.mostThreatenedSpecies ?? '—'} />
        </dl>
      )}

      {briefing.latestMajorEvent && (
        <div>
          <p className="mb-1 font-mono text-xs text-slate-500">LATEST MAJOR EVENT</p>
          <p className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs text-slate-300">
            {briefing.latestMajorEvent}
          </p>
        </div>
      )}

      {deep && (
        <div>
          <p className="mb-1 font-mono text-xs text-slate-500">LATEST DEEP TIME</p>
          <dl className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-xs">
            <Row
              label="Span"
              value={`${formatSimYears(deep.startYear)} → ${formatSimYears(deep.endYear)} (${deep.elapsedSimYears} yr)`}
            />
            <Row label="Runtime" value={`${deep.runtimeSeconds.toFixed(1)}s`} />
            <Row
              label="Organisms"
              value={`${deep.startOrganisms} → ${deep.endOrganisms} (${deep.organismDelta >= 0 ? '+' : ''}${deep.organismDelta})`}
            />
            <Row
              label="Biomass"
              value={`${deep.biomassDelta >= 0 ? '+' : ''}${deep.biomassDelta.toFixed(1)}`}
            />
            <Row
              label="Species"
              value={`${deep.startSpecies} → ${deep.endSpecies} (${deep.speciesDelta >= 0 ? '+' : ''}${deep.speciesDelta})`}
            />
            <Row label="Tiles changed" value={String(deep.changedTilesCount)} />
            <Row
              label="Colonized"
              value={`${deep.colonizedTilesBefore} → ${deep.colonizedTilesAfter}`}
            />
            {deep.majorBlooms > 0 && <Row label="Major blooms" value={String(deep.majorBlooms)} />}
            {deep.majorDieOffs > 0 && <Row label="Major die-offs" value={String(deep.majorDieOffs)} />}
            {deep.selectedSpeciesName && deep.selectedSpeciesPopDelta !== null && (
              <Row
                label={deep.selectedSpeciesName}
                value={`${deep.selectedSpeciesPopBefore} → ${deep.selectedSpeciesPopAfter} (${deep.selectedSpeciesPopDelta >= 0 ? '+' : ''}${deep.selectedSpeciesPopDelta})`}
              />
            )}
            {deep.newSpecies.length > 0 && (
              <Row label="New species" value={deep.newSpecies.slice(0, 3).join(', ')} />
            )}
            {deep.extinctions.length > 0 && (
              <Row label="Extinctions" value={deep.extinctions.slice(0, 3).join(', ')} />
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-300">{value}</dd>
    </div>
  )
}
