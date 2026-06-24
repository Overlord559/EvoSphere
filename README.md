# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, and real-time Pixi viewport rendering.

**Current phase:** v0.3 life

## Status

v0.3 adds deterministic life systems on top of the v0.2 planetary substrate:

- Microbial energy loop (photosynthetic and chemosynthetic)
- Algae and primitive plant colonization
- Genome inheritance with mutation and speciation
- Live species counts, biomass, and biological event log
- Life and biomass viewport overlays

Animals, predators, tools, culture, and civilization remain deferred.

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

## Life simulation (v0.3)

Organisms gain energy from tile environment (light, water, chemicals, fertility), pay metabolism costs, suffer environmental stress, reproduce into suitable neighboring tiles, mutate, and die. Per-tile carrying capacity and a global organism cap prevent runaway growth.

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
