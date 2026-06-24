export function InspectorPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>
        Click-to-inspect detail for tiles, agents, and settlements will live
        here after the viewport is interactive.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-400">
        <li>Selected entity metadata</li>
        <li>Nearby context and relationships</li>
        <li>Historical event trail for selection</li>
      </ul>
      <p className="font-mono text-xs text-command-muted">Status: not started</p>
    </div>
  )
}
