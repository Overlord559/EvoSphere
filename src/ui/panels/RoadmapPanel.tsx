export function RoadmapPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>Planned delivery phases for EvoSphere:</p>
      <ol className="list-inside list-decimal space-y-2 text-slate-400">
        <li>v0.1 foundation — scaffold, types, command shell</li>
        <li>v0.2 world + viewport — procedural generation, Pixi rendering</li>
        <li>
          <span className="text-command-accent">v0.3 life</span> — microbial energy loop,
          plant colonization, first agent entities (current)
        </li>
        <li>v0.4 society — culture, technology, civilization</li>
        <li>v0.5 persistence — snapshots, replay, export</li>
      </ol>
      <p className="text-xs text-slate-500">
        Animals, predators, tools, and civilization modules remain deferred. See{' '}
        <span className="font-mono">docs/ROADMAP.md</span>.
      </p>
    </div>
  )
}
