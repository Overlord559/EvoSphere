import { useSimulationStore } from '../../store/simulationStore'
import { tickToYears, formatSimYears } from '../../simulation/engine/simTime'

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
  'agent.spawned': 'text-emerald-300',
  'agent.migrated': 'text-cyan-400',
  'agent.grazed': 'text-lime-400',
  'agent.predation': 'text-red-400',
  'agent.starved': 'text-orange-400',
  'agent.reproduced': 'text-emerald-500',
  'agent.local_extinction': 'text-red-500',
  'foodweb.prey_collapse': 'text-red-400',
  'foodweb.predator_starvation': 'text-orange-300',
  'foodweb.population_cycle': 'text-amber-300',
}

export function EventsPanel() {
  const events = useSimulationStore((s) => s.snapshot.events)
  const visualMode = useSimulationStore((s) => s.visualMode)

  const visibleEvents = events.filter((e) => e.type !== 'world.tick')

  return (
    <div className="space-y-3 text-sm text-slate-300">
      {visibleEvents.length === 0 ? (
        <p className="text-slate-400">No developments recorded yet — press Play to watch the world evolve.</p>
      ) : (
        <ul className="space-y-2">
          {visibleEvents.map((event) => {
            const colorClass = EVENT_COLORS[event.type] ?? 'text-slate-500'
            const year = formatSimYears(tickToYears(event.tick))
            return (
              <li
                key={event.id}
                className="rounded border border-command-border bg-command-bg/60 p-2 font-mono text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Year {year}</span>
                  {visualMode === 'debug' && (
                    <span className="text-slate-600">tick {event.tick}</span>
                  )}
                  <span className={colorClass}>{event.type.replace(/\./g, ' · ')}</span>
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
