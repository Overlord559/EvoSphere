export function SpeciesPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>
        Species simulation begins in <span className="text-command-accent">v0.3</span>.
        This phase models the planet only — no microbes, plants, or animals yet.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-400">
        <li>Microbial energy loop and metabolism</li>
        <li>Plant colonization of fertile biomes</li>
        <li>Species registry and trait inheritance</li>
        <li>Population counts per biome</li>
      </ul>
      <p className="font-mono text-xs text-command-muted">
        No species data is shown until life systems are implemented.
      </p>
    </div>
  )
}
