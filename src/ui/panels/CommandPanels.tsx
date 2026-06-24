import type { PanelId } from '../../store/simulationStore'
import { useSimulationStore } from '../../store/simulationStore'
import { EventsPanel } from './EventsPanel'
import { InspectorPanel } from './InspectorPanel'
import { RoadmapPanel } from './RoadmapPanel'
import { SpeciesPanel } from './SpeciesPanel'
import { WorldPanel } from './WorldPanel'

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'species', label: 'Species' },
  { id: 'events', label: 'Events' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'roadmap', label: 'Roadmap' },
]

function PanelContent({ panel }: { panel: PanelId }) {
  switch (panel) {
    case 'world':
      return <WorldPanel />
    case 'species':
      return <SpeciesPanel />
    case 'events':
      return <EventsPanel />
    case 'inspector':
      return <InspectorPanel />
    case 'roadmap':
      return <RoadmapPanel />
  }
}

export function CommandPanels() {
  const activePanel = useSimulationStore((s) => s.activePanel)
  const setActivePanel = useSimulationStore((s) => s.setActivePanel)

  return (
    <aside className="flex flex-col rounded-lg border border-command-border bg-command-surface/80">
      <nav
        className="flex flex-wrap gap-1 border-b border-command-border p-2"
        aria-label="Command panels"
      >
        {PANELS.map(({ id, label }) => {
          const isActive = activePanel === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActivePanel(id)}
              aria-pressed={isActive}
              className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
                isActive
                  ? 'bg-command-accent/15 text-command-accent'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          )
        })}
      </nav>
      <div className="p-4" role="region" aria-label={`${activePanel} panel`}>
        <PanelContent panel={activePanel} />
      </div>
    </aside>
  )
}
