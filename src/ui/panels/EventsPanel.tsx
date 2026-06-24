import { useSimulationStore } from '../../store/simulationStore'

export function EventsPanel() {
  const events = useSimulationStore((s) => s.snapshot.events)

  return (
    <div className="space-y-3 text-sm text-slate-300">
      {events.length === 0 ? (
        <p className="text-slate-400">No events recorded yet.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs"
            >
              <div className="flex justify-between gap-2 text-slate-500">
                <span>tick {event.tick}</span>
                <span>{event.type}</span>
              </div>
              <p className="mt-1 text-slate-300">{event.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
