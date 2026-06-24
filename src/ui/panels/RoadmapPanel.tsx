export function RoadmapPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>Planned delivery phases for EvoSphere:</p>
      <ol className="list-inside list-decimal space-y-2 text-slate-400">
        <li>v0.1 foundation — scaffold, types, command shell</li>
        <li>v0.2 world + viewport — procedural generation, Pixi rendering</li>
        <li>v0.3 life — microbial energy loop, plant colonization</li>
        <li>v0.3.2 — species highlight + deep-time performance</li>
        <li>
          <span className="text-command-accent">v0.4 mobile agents</span> — movement,
          herbivory, predation, food webs (current)
        </li>
        <li>v0.5 — body plans, senses, environmental selection</li>
        <li>v0.6+ — culture, technology, civilization (deferred)</li>
        <li>v0.7 — persistence, replay, export</li>
      </ol>
      <p className="text-xs text-slate-500">
        Tools, culture, and civilization remain deferred. See{' '}
        <span className="font-mono">docs/ROADMAP.md</span>.
      </p>
    </div>
  )
}
