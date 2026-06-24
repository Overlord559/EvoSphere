import { useSimulationStore } from '../../store/simulationStore'
import { threatStatus } from '../../simulation/species/speciesOccupancy'
import { lifeKindLabel, terrainLabel } from '../viewport/tileColors'

export function SpeciesPanel() {
  const life = useSimulationStore((s) => s.snapshot.life)
  const tick = useSimulationStore((s) => s.snapshot.tick)
  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId)
  const selectSpecies = useSimulationStore((s) => s.selectSpecies)
  const clearSelectedSpecies = useSimulationStore((s) => s.clearSelectedSpecies)
  const focusSpecies = useSimulationStore((s) => s.focusSpecies)
  const popHistory = useSimulationStore((s) => s.snapshot.briefing)

  const aliveSpecies = life.species.filter((s) => s.population > 0)
  const selectedRecord = selectedSpeciesId
    ? life.species.find((s) => s.id === selectedSpeciesId)
    : null
  const selectedOccupancy = selectedSpeciesId
    ? life.speciesOccupancy[selectedSpeciesId]
    : null

  if (life.totalOrganisms === 0 && snapshot.agents.totalAgents === 0) {
    return (
      <p className="text-sm text-slate-400">
        No living organisms yet. Step the simulation or generate a world with suitable
        hydrothermal, aquatic, and fertile land tiles.
      </p>
    )
  }

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clearSelectedSpecies}
          disabled={!selectedSpeciesId}
          className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          Clear selection
        </button>
      </div>

      {selectedRecord && selectedRecord.population > 0 && (
        <div className="rounded border border-violet-500/30 bg-violet-500/10 p-3 font-mono text-xs">
          <p className="text-violet-300">SELECTED — {selectedRecord.name}</p>
          <dl className="mt-2 space-y-1">
            <Row label="Kind" value={lifeKindLabel(selectedRecord.kind)} />
            <Row label="Trophic role" value={selectedRecord.trophicRole} />
            <Row label="Population" value={String(selectedRecord.population)} />
            <Row label="Biomass" value={selectedRecord.totalBiomass.toFixed(1)} />
            <Row label="Occupied tiles" value={String(selectedOccupancy?.occupiedTileCount ?? 0)} />
            <Row label="Avg generation" value={(selectedOccupancy?.avgGeneration ?? selectedRecord.generation).toFixed(1)} />
            <Row label="Avg energy" value={(selectedOccupancy?.avgEnergy ?? 0).toFixed(2)} />
            <Row label="Avg health" value={(selectedOccupancy?.avgHealth ?? 0).toFixed(2)} />
            <Row
              label="Dominant habitat"
              value={selectedOccupancy?.dominantTerrain ? terrainLabel(selectedOccupancy.dominantTerrain) : '—'}
            />
            <Row
              label="Status"
              value={threatStatus(
                selectedRecord,
                selectedRecord.population - (popHistory.selectedSpecies?.popDelta ?? 0),
              )}
            />
            {(selectedRecord.preySpeciesIds.length > 0 || selectedRecord.predatorSpeciesIds.length > 0) && (
              <>
                {selectedRecord.preySpeciesIds.length > 0 && (
                  <Row
                    label="Prey links"
                    value={selectedRecord.preySpeciesIds
                      .map((id) => life.species.find((s) => s.id === id)?.name ?? id.slice(0, 6))
                      .join(', ')}
                  />
                )}
                {selectedRecord.predatorSpeciesIds.length > 0 && (
                  <Row
                    label="Predator links"
                    value={selectedRecord.predatorSpeciesIds
                      .map((id) => life.species.find((s) => s.id === id)?.name ?? id.slice(0, 6))
                      .join(', ')}
                  />
                )}
              </>
            )}
          </dl>
        </div>
      )}

      <dl className="space-y-1.5 font-mono text-xs">
        <Row label="Tick" value={String(tick)} />
        <Row label="Total organisms" value={String(life.totalOrganisms)} />
        <Row label="Species (alive)" value={String(aliveSpecies.length)} />
      </dl>

      <div>
        <p className="mb-2 font-mono text-xs text-slate-500">SPECIES REGISTRY — click to select</p>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {aliveSpecies.map((species) => {
            const isSelected = species.id === selectedSpeciesId
            const occupancy = life.speciesOccupancy[species.id]
            return (
              <li key={species.id}>
                <div
                  className={`rounded border p-2 font-mono text-xs transition-colors ${
                    isSelected
                      ? 'border-violet-400/60 bg-violet-500/15'
                      : 'border-command-border bg-command-bg/60 hover:border-command-accent/30'
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => selectSpecies(species.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className={isSelected ? 'text-violet-300' : 'text-command-accent'}>
                        {species.name}
                      </span>
                      <span className="text-emerald-400">{species.population} pop</span>
                    </div>
                    <div className="mt-1 flex justify-between text-slate-400">
                      <span>
                        {lifeKindLabel(species.kind)} · {species.trophicRole}
                      </span>
                      <span>{occupancy?.occupiedTileCount ?? 0} tiles</span>
                    </div>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <MiniButton onClick={() => selectSpecies(species.id)} active={isSelected}>
                      Select
                    </MiniButton>
                    <MiniButton onClick={() => focusSpecies(species.id)}>Focus</MiniButton>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function MiniButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        active
          ? 'border-violet-400/50 text-violet-300'
          : 'border-command-border text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
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
