import { useSimulationStore } from '../../store/simulationStore'
import { topSpeciesOnTile } from '../../simulation/life/LifeSystem'
import { formatPercent, formatTemperature } from '../../simulation/world'
import { lifeKindLabel, terrainLabel } from '../viewport/tileColors'

export function InspectorPanel() {
  const selectedTile = useSimulationStore((s) => s.selectedTile)
  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const selectSpecies = useSimulationStore((s) => s.selectSpecies)
  const clearSelectedSpecies = useSimulationStore((s) => s.clearSelectedSpecies)

  if (!selectedTile) {
    return (
      <p className="text-sm text-slate-400">
        Select a tile in the viewport to inspect terrain, climate, and local life.
      </p>
    )
  }

  const tileLife = snapshot.life.organisms.filter(
    (o) => o.x === selectedTile.x && o.y === selectedTile.y,
  )
  const idx = selectedTile.y * snapshot.world.width + selectedTile.x
  const tileCount = snapshot.life.tileCounts[idx] ?? 0
  const tileBiomass = snapshot.life.tileBiomass[idx] ?? 0
  const topSpecies = topSpeciesOnTile(snapshot.life.organisms, selectedTile.x, selectedTile.y)
  const speciesNames = new Map(snapshot.life.species.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4 text-sm text-slate-300">
      {selectedSpeciesId && (
        <button
          type="button"
          onClick={clearSelectedSpecies}
          className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200"
        >
          Clear selected species
        </button>
      )}

      <dl className="space-y-2 font-mono text-xs">
        <Row label="Position" value={`(${selectedTile.x}, ${selectedTile.y})`} />
        <Row label="Terrain" value={terrainLabel(selectedTile.terrain)} />
        <Row label="Elevation" value={formatPercent(selectedTile.elevation)} />
        <Row label="Moisture" value={formatPercent(selectedTile.moisture)} />
        <Row label="Temperature" value={formatTemperature(selectedTile.temperature)} />
        <Row label="Water" value={formatPercent(selectedTile.water)} />
        <Row label="Soil fertility" value={formatPercent(selectedTile.soilFertility)} />
      </dl>

      <div>
        <p className="mb-2 font-mono text-xs text-slate-500">LIFE ON TILE</p>
        {tileCount === 0 ? (
          <p className="text-xs text-slate-400">No organisms on this tile.</p>
        ) : (
          <>
            <dl className="mb-2 space-y-1 font-mono text-xs">
              <Row label="Organisms" value={String(tileCount)} />
              <Row label="Biomass" value={tileBiomass.toFixed(2)} />
            </dl>

            {topSpecies.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[10px] text-slate-500">TOP SPECIES — click to select</p>
                <ul className="space-y-1 font-mono text-xs">
                  {topSpecies.slice(0, 4).map(({ speciesId, kind, count }) => {
                    const isSelected = speciesId === selectedSpeciesId
                    return (
                      <li key={speciesId}>
                        <button
                          type="button"
                          onClick={() => selectSpecies(speciesId)}
                          className={`flex w-full justify-between gap-2 rounded border px-2 py-1 text-left ${
                            isSelected
                              ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
                              : 'border-command-border/60 text-slate-400 hover:border-command-accent/30'
                          }`}
                        >
                          <span>{speciesNames.get(speciesId) ?? lifeKindLabel(kind)}</span>
                          <span>{count}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <ul className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs text-slate-400">
              {tileLife.map((organism) => (
                <li
                  key={organism.id}
                  className={`rounded border px-2 py-1 ${
                    organism.speciesId === selectedSpeciesId
                      ? 'border-violet-400/40 bg-violet-500/10'
                      : 'border-command-border/60'
                  }`}
                >
                  {lifeKindLabel(organism.kind)} · E {organism.energy.toFixed(2)} · H{' '}
                  {organism.health.toFixed(2)} · age {organism.age}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
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
