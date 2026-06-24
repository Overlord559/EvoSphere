export function RoadmapPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>Planned delivery phases for EvoSphere:</p>
      <ol className="list-inside list-decimal space-y-2 text-slate-400">
        <li>v0.1 foundation — scaffold, types, command shell</li>
        <li>
          <span className="text-command-accent">v0.2 world + viewport</span> — procedural
          generation, Pixi rendering (current)
        </li>
        <li>
          <span className="text-command-accent">v0.3 life</span> — microbes, plants, energy
          loop, agents, genetics, behavior, ecology
        </li>
        <li>v0.4 society — culture, technology, civilization</li>
        <li>v0.5 persistence — snapshots, replay, export</li>
      </ol>
      <p className="text-xs text-slate-500">
        Agents and species are intentionally deferred until the planetary substrate is
        observable and deterministic. See <span className="font-mono">docs/ROADMAP.md</span>.
      </p>
    </div>
  )
}
