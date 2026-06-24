import { useSimulationStore } from '../../store/simulationStore'
import { isTileActive } from '../../simulation/world'
import { topSpeciesOnTile } from '../../simulation/life/LifeSystem'
import { agentsOnTile, topAgentSpeciesOnTile } from '../../simulation/agents/AgentSystem'
import { formatPercent, formatTemperature } from '../../simulation/world'
import { lifeKindLabel, terrainLabel, ecosystemLabel } from '../viewport/tileColors'
import { controllerGoalLabel } from '../../simulation/cognition/behaviorPolicy'
import { InspectorPreview } from '../viewport/InspectorPreview'
import {
  representativeAgent,
  representativeOrganism,
} from '../viewport/visualGenes'

export function InspectorPanel() {
  const selectedTile = useSimulationStore((s) => s.selectedTile)
  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const selectSpecies = useSimulationStore((s) => s.selectSpecies)
  const clearSelectedSpecies = useSimulationStore((s) => s.clearSelectedSpecies)
  const focusTile = useSimulationStore((s) => s.focusTile)

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
  const tileAgents = agentsOnTile(snapshot.agents.agents, selectedTile.x, selectedTile.y)
  const idx = selectedTile.y * snapshot.world.width + selectedTile.x
  const tilePopulationUnits = snapshot.life.populationUnits.filter((u) => u.tileIndex === idx)
  const isActive = isTileActive(snapshot.world, selectedTile.x, selectedTile.y)
  const isVoid = selectedTile.terrain === 'void' || !isActive
  const tileCount = snapshot.life.tileCounts[idx] ?? 0
  const tileBiomass = snapshot.life.tileBiomass[idx] ?? 0
  const agentCount = snapshot.agents.tileAgentCounts[idx] ?? 0
  const topSpecies = topSpeciesOnTile(snapshot.life.organisms, selectedTile.x, selectedTile.y)
  const topAgents = topAgentSpeciesOnTile(snapshot.agents.agents, selectedTile.x, selectedTile.y)
  const speciesNames = new Map(snapshot.life.species.map((s) => [s.id, s.name]))
  const speciesRoles = new Map(snapshot.life.species.map((s) => [s.id, s.trophicRole]))
  const speciesById = new Map(snapshot.life.species.map((s) => [s.id, s]))

  const previewSpeciesId =
    selectedSpeciesId ??
    topSpecies[0]?.speciesId ??
    topAgents[0]?.speciesId ??
    null
  const previewSpecies = previewSpeciesId ? speciesById.get(previewSpeciesId) ?? null : null
  const previewOrganism = representativeOrganism(tileLife, previewSpeciesId)
  const previewAgent = representativeAgent(tileAgents, previewSpeciesId)
  const previewPopulation = previewSpeciesId
    ? (topSpecies.find((s) => s.speciesId === previewSpeciesId)?.count ?? 0) +
      (topAgents.find((s) => s.speciesId === previewSpeciesId)?.count ?? 0)
    : tileCount + agentCount
  const previewBiomass = previewSpecies?.totalBiomass ?? tileBiomass

  return (
    <div className="space-y-4 text-sm text-slate-300">
      {(previewSpecies || previewOrganism || previewAgent) && (
        <InspectorPreview
          tile={selectedTile}
          species={previewSpecies}
          organism={previewOrganism}
          agent={previewAgent}
          population={previewPopulation}
          biomass={previewBiomass}
        />
      )}
      {selectedSpeciesId && (
        <button
          type="button"
          onClick={clearSelectedSpecies}
          className="rounded border border-command-border px-2 py-1 font-mono text-xs text-slate-400 hover:text-slate-200"
        >
          Clear selected species
        </button>
      )}

      {previewAgent && (
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-3 font-mono text-xs">
          <p className="text-cyan-300">PROTO-COGNITION</p>
          <dl className="mt-2 space-y-1">
            <Row label="Current goal" value={previewAgent.currentGoal.replace(/_/g, ' ')} />
            <Row label="Controller bias" value={controllerGoalLabel(previewAgent)} />
            <Row
              label="Inherited knowledge"
              value={previewAgent.memory?.inheritedKnowledgeScore.toFixed(2) ?? '—'}
            />
            <Row label="Habitat fitness" value={previewAgent.environmentalFitness.toFixed(2)} />
            <Row label="Target reason" value={previewAgent.targetReason} />
          </dl>
        </div>
      )}

      <dl className="space-y-2 font-mono text-xs">
        <Row label="Position" value={`(${selectedTile.x}, ${selectedTile.y})`} />
        <Row label="Status" value={isVoid ? 'Space / void (inactive)' : 'Active planet tile'} />
        <Row label="Terrain (substrate)" value={isVoid ? 'void' : terrainLabel(selectedTile.terrain)} />
        {!isVoid && selectedTile.ecosystem !== 'none' && (
          <Row label="Ecosystem" value={ecosystemLabel(selectedTile.ecosystem)} />
        )}
        {!isVoid && (
          <Row label="Succession" value={selectedTile.successionStage.replace(/_/g, ' ')} />
        )}
        <Row label="Elevation" value={formatPercent(selectedTile.elevation)} />
        <Row label="Moisture" value={formatPercent(selectedTile.moisture)} />
        <Row label="Temperature" value={formatTemperature(selectedTile.temperature)} />
        <Row label="Water" value={formatPercent(selectedTile.water)} />
        <Row label="Soil fertility" value={formatPercent(selectedTile.soilFertility)} />
      </dl>

      {!isVoid && (
        <button
          type="button"
          onClick={() => focusTile(selectedTile.x, selectedTile.y, 3.5)}
          className="rounded border border-cyan-500/30 px-2 py-1 font-mono text-xs text-cyan-300 hover:bg-cyan-500/10"
        >
          Zoom to tile
        </button>
      )}

      <div>
        <p className="mb-2 font-mono text-xs text-slate-500">LIFE ON TILE</p>
        {isVoid ? (
          <p className="text-xs text-slate-500">Outside active planet — no life can exist here.</p>
        ) : tileCount === 0 && agentCount === 0 ? (
          <p className="text-xs text-slate-400">No organisms on this tile.</p>
        ) : (
          <>
            <dl className="mb-2 space-y-1 font-mono text-xs">
              <Row label="Producers" value={String(tileCount)} />
              <Row label="Mobile agents" value={String(agentCount)} />
              <Row label="Biomass" value={tileBiomass.toFixed(2)} />
            </dl>

            {tilePopulationUnits.length > 0 && (
              <div className="mb-2 rounded border border-violet-500/20 bg-violet-500/5 p-2">
                <p className="mb-1 font-mono text-[10px] text-violet-300">POPULATION UNITS / COHORTS</p>
                <ul className="space-y-1 font-mono text-[10px] text-slate-400">
                  {tilePopulationUnits.map((unit) => (
                    <li key={unit.id}>
                      {unit.unitType} · ~{unit.representedIndividuals.toLocaleString()} {unit.displayScaleLabel}
                      {unit.representedIndividuals > 1000 ? ' (compressed aggregate)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(topSpecies.length > 0 || topAgents.length > 0) && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[10px] text-slate-500">TOP SPECIES — click to select</p>
                <ul className="space-y-1 font-mono text-xs">
                  {[...topSpecies, ...topAgents].slice(0, 5).map(({ speciesId, kind, count }) => {
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
                          <span>
                            {speciesNames.get(speciesId) ?? lifeKindLabel(kind)} ·{' '}
                            {speciesRoles.get(speciesId) ?? '—'}
                          </span>
                          <span>{count}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {tileAgents.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[10px] text-slate-500">MOBILE AGENTS</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-slate-400">
                  {tileAgents.map((agent) => (
                    <li
                      key={agent.id}
                      className={`rounded border px-2 py-1 ${
                        agent.speciesId === selectedSpeciesId
                          ? 'border-violet-400/40 bg-violet-500/10'
                          : 'border-command-border/60'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => selectSpecies(agent.speciesId)}
                      >
                        {lifeKindLabel(agent.kind)} · {agent.trophicRole} · goal {agent.currentGoal}
                        {' · '}
                        {agent.targetReason} · E {agent.energy.toFixed(2)} · fit{' '}
                        {agent.environmentalFitness.toFixed(2)}
                      </button>
                    </li>
                  ))}
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
                  {lifeKindLabel(organism.kind)} · producer · E {organism.energy.toFixed(2)} · H{' '}
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
