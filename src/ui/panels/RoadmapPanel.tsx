export function RoadmapPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>Planned delivery phases for EvoSphere:</p>
      <ol className="list-inside list-decimal space-y-2 text-slate-400">
        <li>
          <span className="text-command-accent">v0.1 foundation</span> — scaffold,
          types, command shell (current)
        </li>
        <li>v0.2 world + viewport — procedural generation, Pixi rendering</li>
        <li>v0.3 life — agents, genetics, behavior, ecology</li>
        <li>v0.4 society — culture, technology, civilization</li>
        <li>v0.5 persistence — snapshots, replay, export</li>
      </ol>
      <p className="text-xs text-slate-500">
        See <span className="font-mono">docs/ROADMAP.md</span> for full detail.
      </p>
    </div>
  )
}
