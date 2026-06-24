import { useSimulationStore } from '../../store/simulationStore'

const EVENT_COLORS: Record<string, string> = {
  'life.first': 'text-emerald-400',
  'life.bloom': 'text-lime-300',
  'life.die_off': 'text-red-400',
  'life.extinction': 'text-red-500',
  'life.speciation': 'text-violet-300',
  'life.colonization': 'text-cyan-300',
  'life.population_shift': 'text-amber-300',
  'life.reproduce': 'text-slate-400',
  'world.deep_time_summary': 'text-amber-400',
  'world.generated': 'text-slate-500',
  'world.reset': 'text-slate-500',
  'world.tick': 'text-slate-600',
}

export function EventsPanel() {
  const events = useSimulationStore((s) => s.snapshot.events)

  return (
    <div className="space-y-3 text-sm text-slate-300">
      {events.length === 0 ? (
        <p className="text-slate-400">No events recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const colorClass = EVENT_COLORS[event.type] ?? 'text-slate-500'
            return (
              <li
                key={event.id}
                className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">tick {event.tick}</span>
                  <span className={colorClass}>{event.type}</span>
                </div>
                <p className="mt-1 text-slate-300">{event.message}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
