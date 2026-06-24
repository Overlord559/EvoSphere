import { useSimulationStore } from '../../store/simulationStore'
import { formatSimYears } from '../../simulation/engine/simTime'
import { lifeKindLabel } from '../viewport/tileColors'

export function BriefingPanel() {
  const briefing = useSimulationStore((s) => s.snapshot.briefing)
  const tick = useSimulationStore((s) => s.snapshot.tick)
  const deep = briefing.latestDeepTimeSummary

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <div className="rounded border border-command-accent/20 bg-command-accent/5 p-3">
        <p className="font-mono text-xs text-command-accent">WORLD BRIEFING</p>
        <p className="mt-2 text-lg font-mono text-slate-100">
          Year {formatSimYears(briefing.simulatedYear)}
        </p>
        <p className="font-mono text-xs text-slate-400">
          Tick {tick} · ~{briefing.estimatedGenerations} gen · {briefing.era}
        </p>
      </div>

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
              value={`${formatSimYears(deep.startYear)} → ${formatSimYears(deep.endYear)}`}
            />
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
            {deep.newSpecies.length > 0 && (
              <Row label="New species" value={deep.newSpecies.slice(0, 3).join(', ')} />
            )}
            {deep.extinctions.length > 0 && (
              <Row label="Extinctions" value={deep.extinctions.slice(0, 3).join(', ')} />
            )}
            {deep.dominantSpeciesBefore !== deep.dominantSpeciesAfter && (
              <Row
                label="Dominant shift"
                value={`${deep.dominantSpeciesBefore ?? 'none'} → ${deep.dominantSpeciesAfter ?? 'none'}`}
              />
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
