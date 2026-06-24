export function SpeciesPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>
        Species definitions, population tracking, and trait inheritance will
        appear here once agents and genetics are online.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-400">
        <li>Species registry and lineage graphs</li>
        <li>Population counts per biome</li>
        <li>Trait summaries and mutation rates</li>
      </ul>
      <p className="font-mono text-xs text-command-muted">Status: not started</p>
    </div>
  )
}
