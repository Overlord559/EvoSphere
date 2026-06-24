# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, and real-time Pixi viewport rendering.

**Current phase:** v0.3.1 runtime + observability

## Status

v0.3.1 adds simulation runtime controls, deep-time fast-forward, and observability on top of v0.3 life systems:

- **Run / Pause / Step** — 1, 10, 100, 1,000 tick steps with reliable engine-owned loop
- **Speed modes** — 1×, 10×, 100×, 1,000× continuous run
- **Deep time** — +1K / +10K / +100K / +1M year jumps with summary events
- **World briefing** — era, dominant species, threats, blooms, deep-time recap
- **Species clustering fix** — founder lineages share species; speciation requires divergence + generations + population
- Life and biomass overlays with activity highlights

v0.3 foundation:

- Microbial energy loop (photosynthetic and chemosynthetic)
- Algae and primitive plant colonization
- Genome inheritance with mutation and speciation
- Live species counts, biomass, and biological event log

Animals, predators, tools, culture, and civilization remain deferred to v0.4+.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Pixi.js (tile viewport + life overlays)
- Zustand (UI + session state)
- seedrandom (deterministic RNG)
- nanoid (entity/species/event IDs)

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Simulation time

- **Tick** — atomic simulation step (life energy, reproduction, death)
- **Generation estimate** — ~25 ticks per generation (approximate)
- **Simulated years** — 10 ticks ≈ 1 year (tunable abstraction for deep-time jumps)

Same world seed produces the same founder placement. Life tick RNG uses `forkRng(seed, 'life-tick-N')`.

## Documentation

- [Project Brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Principles

- No backend — runs entirely in the browser
- Deterministic simulation from seed
- No external AI dependencies
- Energy drives life — no magic unlocks
- 2D viewport (Pixi.js), not 3D
