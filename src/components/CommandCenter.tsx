import { useSimulationStore } from '../store/simulationStore'
import { CommandPanels } from '../ui/panels/CommandPanels'
import { WorldViewport } from '../ui/viewport/WorldViewport'

const MISSION =
  'A physics-constrained, Earth-like biosphere-to-space-age civilization simulator. Life emerges from simple origins — no preset endpoint species, no magic unlocks.'

export function CommandCenter() {
  const phase = useSimulationStore((s) => s.phase)

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-command-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl tracking-widest text-command-accent">
              EVOSPHERE
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">{MISSION}</p>
          </div>
          <div
            className="rounded border border-command-accent/30 bg-command-accent/10 px-3 py-1.5 font-mono text-xs text-command-accent"
            aria-label="Current phase"
          >
            PHASE: {phase}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6 lg:flex-row">
        <section className="flex flex-1 flex-col min-w-0" aria-label="Viewport">
          <WorldViewport />
        </section>
        <section className="w-full lg:w-[360px] shrink-0" aria-label="Command panels">
          <CommandPanels />
        </section>
      </main>

      <footer className="border-t border-command-border px-6 py-3">
        <p className="font-mono text-xs text-slate-500">
          v0.3 — life systems active. Step ticks to grow populations. Animals and society
          modules begin in later phases.
        </p>
      </footer>
    </div>
  )
}
