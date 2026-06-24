export function EventsPanel() {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p>
        The event log will stream simulation milestones — births, extinctions,
        migrations, and cultural shifts — as ticks advance.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-400">
        <li>Tick-indexed event entries</li>
        <li>Filterable by event type</li>
        <li>Persisted snapshots via IndexedDB</li>
      </ul>
      <p className="font-mono text-xs text-command-muted">Status: not started</p>
    </div>
  )
}
