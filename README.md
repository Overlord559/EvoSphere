# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, and real-time Pixi viewport rendering.

**Current phase:** v0.3.2 species highlight + deep-time performance

## Status

v0.3.2 adds species-level map observability and deep-time performance improvements:

- **Species selection** — click species in panel or inspector; map highlights all occupied tiles (violet glow)
- **Species summary** — population, biomass, occupied tiles, avg generation/energy/health, habitat, threat status
- **Briefing integration** — selected-species briefing when a species is focused
- **Deep-time performance** — batched 5K-tick chunks, O(1) tile counts, throttled snapshot rebuilds during batch runs
- **Deep-time progress** — progress bar, elapsed seconds, honest slow labels on +100K/+1M buttons
- **Enhanced deep-time summary** — runtime duration, selected species delta, major blooms/die-offs

v0.3.1 foundation:

- Run/pause/step, speed modes, deep-time fast-forward, world briefing, species clustering fix

Animals, predators, tools, culture, and civilization remain deferred to v0.4.

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

## Deep-time performance (approximate, seed `evosphere-prime`, 96×96)

| Jump | Typical runtime |
|------|-----------------|
| +1K yr | ~15–20s |
| +10K yr | ~2–3 min |
| +100K / +1M | minutes — exact tick simulation, UI stays responsive via chunked async stepping |

## Simulation time

- **Tick** — atomic simulation step
- **Generation estimate** — ~25 ticks per generation
- **Simulated years** — 10 ticks ≈ 1 year

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
