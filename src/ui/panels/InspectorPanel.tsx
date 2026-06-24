import { useSimulationStore } from '../../store/simulationStore'
import { formatPercent, formatTemperature } from '../../simulation/world'
import { terrainLabel } from '../viewport/tileColors'

export function InspectorPanel() {
  const selectedTile = useSimulationStore((s) => s.selectedTile)

  if (!selectedTile) {
    return (
      <p className="text-sm text-slate-400">
        Select a tile in the viewport to inspect terrain and climate attributes.
      </p>
    )
  }

  return (
    <dl className="space-y-2 font-mono text-xs text-slate-300">
      <Row label="Position" value={`(${selectedTile.x}, ${selectedTile.y})`} />
      <Row label="Terrain" value={terrainLabel(selectedTile.terrain)} />
      <Row label="Elevation" value={formatPercent(selectedTile.elevation)} />
      <Row label="Moisture" value={formatPercent(selectedTile.moisture)} />
      <Row label="Temperature" value={formatTemperature(selectedTile.temperature)} />
      <Row label="Water" value={formatPercent(selectedTile.water)} />
      <Row label="Soil fertility" value={formatPercent(selectedTile.soilFertility)} />
      <Row label="Resource deposits" value={formatPercent(selectedTile.resourceDeposits)} />
    </dl>
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
