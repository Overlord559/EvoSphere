# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent life (v0.3+), and real-time Pixi viewport rendering.

**Current phase:** v0.2 world + viewport

## Status

v0.2 delivers a deterministic procedural planet with climate attributes and a live Pixi.js tile map. The simulation engine owns world state and emits real events. Life systems (microbes, plants, agents) begin in v0.3.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Pixi.js (tile viewport)
- Zustand (UI + session state)
- seedrandom (deterministic RNG)
- nanoid (world/event IDs)
- idb (persistence planned v0.5)

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## World generation

Same seed + same settings always produce the same tile grid. Generation uses `forkRng()` substreams for elevation, moisture, temperature, rivers, and volcanic features. No `Math.random()`.

Default world size: 96×96 tiles. Change via `SimulationSettings` in the store.

## Documentation

- [Project Brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Principles

- No backend — runs entirely in the browser
- Deterministic simulation from seed
- No external AI dependencies
- 2D viewport (Pixi.js), not 3D
- No fake population or species data
