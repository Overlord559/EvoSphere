export function ViewportPlaceholder() {
  return (
    <div
      className="flex min-h-[280px] flex-1 flex-col items-center justify-center rounded-lg border border-command-border bg-command-surface/60 p-8"
      aria-label="Simulation viewport"
    >
      <div
        className="mb-4 h-16 w-16 rounded-full border-2 border-dashed border-command-accent/40"
        aria-hidden="true"
      />
      <p className="font-mono text-sm text-command-accent">VIEWPORT STANDBY</p>
      <p className="mt-2 max-w-sm text-center text-sm text-slate-400">
        Pixi.js world rendering lands in v0.2. This panel will host the live
        simulation canvas.
      </p>
    </div>
  )
}
