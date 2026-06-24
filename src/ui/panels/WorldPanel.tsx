export function WorldPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>
        Procedural terrain, climate bands, and biome distribution will be
        generated from a deterministic seed.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-400">
        <li>Terrain types: ocean, coast, plains, forest, mountain, desert, tundra, swamp</li>
        <li>Tile attributes: elevation, moisture, temperature</li>
        <li>World size configurable via simulation settings</li>
      </ul>
      <p className="font-mono text-xs text-command-muted">Status: not started</p>
    </div>
  )
}
