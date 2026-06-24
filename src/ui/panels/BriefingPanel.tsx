import { useSimulationStore } from '../../store/simulationStore'
import { formatSimYears } from '../../simulation/engine/simTime'
import { lifeKindLabel } from '../viewport/tileColors'

const SEVERITY_STYLES = {
  info: 'border-command-border text-slate-300',
  warning: 'border-amber-500/30 text-amber-200',
  positive: 'border-emerald-500/30 text-emerald-200',
} as const

export function BriefingPanel() {
  const briefing = useSimulationStore((s) => s.snapshot.briefing)
  const visualMode = useSimulationStore((s) => s.visualMode)
  const focusTile = useSimulationStore((s) => s.focusTile)
  const deep = briefing.latestDeepTimeSummary
  const selected = briefing.selectedSpecies
  const developments = briefing.latestDevelopments

  return (
    <div className="space-y-4 text-sm text-slate-300">
      {selected ? (
        <div className="rounded border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="font-mono text-xs text-violet-300">SELECTED SPECIES BRIEFING</p>
          <p className="mt-2 font-mono text-lg text-slate-100">{selected.name}</p>
          <p className="font-mono text-xs text-slate-400">
            {lifeKindLabel(selected.kind)} · {selected.trophicRole} · {selected.trend}
          </p>
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
            {selected.preyLinks.length > 0 && (
              <Row label="Prey" value={selected.preyLinks.join(', ')} />
            )}
            {selected.predatorLinks.length > 0 && (
              <Row label="Predators" value={selected.predatorLinks.join(', ')} />
            )}
            {selected.bodyPlanSummary && (
              <Row label="Body plan" value={selected.bodyPlanSummary} />
            )}
            {selected.sensesSummary && <Row label="Senses" value={selected.sensesSummary} />}
            {selected.environmentalFitnessScore != null && (
              <Row label="Fitness" value={selected.environmentalFitnessScore.toFixed(2)} />
            )}
            {selected.selectionPressures.length > 0 && (
              <Row label="Selection pressure" value={selected.selectionPressures.join(', ')} />
            )}
            {selected.extinctionRisk != null && (
              <Row label="Extinction risk" value={selected.extinctionRisk.toFixed(2)} />
            )}
            {selected.adaptationNotes.length > 0 && (
              <Row label="Adaptation" value={selected.adaptationNotes.join('; ')} />
            )}
          </dl>
        </div>
      ) : (
        <div className="rounded border border-command-accent/20 bg-command-accent/5 p-3">
          <p className="font-mono text-xs text-command-accent">WORLD BRIEFING</p>
          <p className="mt-2 text-lg font-mono text-slate-100">
            Year {formatSimYears(briefing.simulatedYear)}
          </p>
          <p className="font-mono text-xs text-slate-400">
            {briefing.era} · ~{briefing.estimatedGenerations} generations
          </p>
          {visualMode === 'debug' && (
            <p className="font-mono text-[10px] text-slate-600">
              debug: internal generation estimate only
            </p>
          )}
        </div>
      )}

      {developments.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs text-slate-500">LATEST DEVELOPMENTS</p>
          <ul className="space-y-2">
            {developments.map((dev) => (
              <li
                key={dev.id}
                className={`rounded border bg-command-bg/60 p-2 font-mono text-xs ${SEVERITY_STYLES[dev.severity]}`}
              >
                <p>{dev.message}</p>
                {dev.focusTileX != null && dev.focusTileY != null && (
                  <button
                    type="button"
                    onClick={() => focusTile(dev.focusTileX!, dev.focusTileY!, 3)}
                    className="mt-1 rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-cyan-300"
                  >
                    Focus region
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.activeDisasters.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs text-slate-500">ACTIVE DISASTERS</p>
          <ul className="space-y-2">
            {briefing.activeDisasters.map((d) => (
              <li
                key={d.id}
                className="rounded border border-orange-500/30 bg-orange-500/5 p-2 font-mono text-xs text-orange-200"
              >
                <p className="font-medium">{d.type.replace(/_/g, ' ')} · {d.severity}</p>
                <p className="mt-1 text-orange-200/80">{d.effectSummary}</p>
                <p className="mt-1 text-[10px] text-orange-300/70">{d.lifeImpact}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!selected && briefing.disasterPacingSummary && (
        <div className="rounded border border-orange-500/20 bg-orange-500/5 p-2 font-mono text-xs text-orange-200/90">
          <p className="mb-1 text-orange-300/80">DISASTER PACING</p>
          <p>{briefing.disasterPacingSummary}</p>
        </div>
      )}

      {!selected && briefing.successionOverview && (
        <div>
          <p className="mb-2 font-mono text-xs text-slate-500">ECOLOGICAL SUCCESSION</p>
          <dl className="grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-400">
            <Row label="Barren" value={`${briefing.successionOverview.barrenPercent.toFixed(0)}%`} />
            <Row label="Microbial" value={`${briefing.successionOverview.microbialPercent.toFixed(0)}%`} />
            <Row label="Algal" value={`${briefing.successionOverview.algalPercent.toFixed(0)}%`} />
            <Row label="Pioneer plants" value={`${briefing.successionOverview.pioneerPercent.toFixed(0)}%`} />
            <Row label="Grassland" value={`${briefing.successionOverview.grasslandPercent.toFixed(0)}%`} />
            <Row label="Forest" value={`${briefing.successionOverview.forestPercent.toFixed(0)}%`} />
            <Row label="Swamp/marsh" value={`${briefing.successionOverview.swampMarshPercent.toFixed(0)}%`} />
          </dl>
        </div>
      )}

      {!selected && briefing.populationArchitecture && (
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-xs text-emerald-100/90">
          <p className="mb-1 text-emerald-300/80">POPULATION ARCHITECTURE</p>
          <dl className="space-y-0.5">
            <Row
              label="Tracked / aggregate orgs"
              value={`${briefing.populationArchitecture.trackedOrganisms} / ${briefing.populationArchitecture.aggregateOrganisms}`}
            />
            <Row
              label="Tracked / reserve agents"
              value={`${briefing.populationArchitecture.trackedAgents} / ${briefing.populationArchitecture.agentReserve}`}
            />
            <Row
              label="Capacity pressure"
              value={`${briefing.populationArchitecture.capacityPressurePct}%`}
            />
            {briefing.populationArchitecture.plateauExplanation && (
              <p className="pt-1 text-[10px] text-slate-400">{briefing.populationArchitecture.plateauExplanation}</p>
            )}
          </dl>
        </div>
      )}

      {!selected && briefing.bottleneckStatus && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 font-mono text-xs text-amber-200">
          <p className="mb-1 text-amber-300">RECOVERY STATUS</p>
          <p>{briefing.bottleneckStatus}</p>
        </div>
      )}

      {!selected && briefing.protoCognitionSummary && (
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2 font-mono text-xs text-cyan-200/90">
          <p className="mb-1 text-cyan-300/80">PROTO-COGNITION</p>
          <p>{briefing.protoCognitionSummary}</p>
        </div>
      )}

      {!selected && briefing.originExplanation && (
        <div className="rounded border border-slate-600/40 bg-slate-800/40 p-2 font-mono text-xs text-slate-400">
          <p className="mb-1 text-slate-500">ORIGIN PROFILE</p>
          <p>{briefing.originExplanation}</p>
        </div>
      )}

      {!selected && briefing.selectionNarratives.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs text-slate-500">ENVIRONMENTAL SELECTION</p>
          <ul className="space-y-2">
            {briefing.selectionNarratives.map((line) => (
              <li
                key={line}
                className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-xs text-emerald-100"
              >
                {line}
              </li>
            ))}
          </ul>
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
          <Row label="Dominant grazer" value={briefing.dominantGrazerSpecies ?? '—'} />
          <Row label="Dominant predator" value={briefing.dominantPredatorSpecies ?? '—'} />
          <Row label="Food web" value={briefing.predatorPreyTrend ?? '—'} />
        </dl>
      )}

      {briefing.foodWebWarning && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 font-mono text-xs text-red-300">
          {briefing.foodWebWarning}
        </div>
      )}

      {briefing.recentFoodWebEvent && (
        <div>
          <p className="mb-1 font-mono text-xs text-slate-500">RECENT FOOD WEB EVENT</p>
          <p className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs text-slate-300">
            {briefing.recentFoodWebEvent}
          </p>
        </div>
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
          <p className="mb-1 font-mono text-xs text-slate-500">LATEST DEEP TIME SUMMARY</p>
          <dl className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-xs">
            <Row
              label="Span"
              value={`${formatSimYears(deep.startYear)} → ${formatSimYears(deep.endYear)} (${deep.elapsedSimYears} yr)`}
            />
            <Row label="Runtime" value={`${deep.runtimeSeconds.toFixed(1)}s real time`} />
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
            <Row
              label="Grazers"
              value={`${deep.startGrazers} → ${deep.endGrazers} (${deep.grazerDelta >= 0 ? '+' : ''}${deep.grazerDelta})`}
            />
            <Row
              label="Predators"
              value={`${deep.startPredators} → ${deep.endPredators} (${deep.predatorDelta >= 0 ? '+' : ''}${deep.predatorDelta})`}
            />
            {deep.predationCount > 0 && <Row label="Predations" value={String(deep.predationCount)} />}
            {deep.starvationCount > 0 && <Row label="Starvations" value={String(deep.starvationCount)} />}
            {deep.localExtinctions > 0 && (
              <Row label="Local extinctions" value={String(deep.localExtinctions)} />
            )}
            {deep.dominantTrophicShift && (
              <Row label="Trophic shift" value={deep.dominantTrophicShift} />
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
