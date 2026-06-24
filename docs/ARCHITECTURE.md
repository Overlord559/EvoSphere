# EvoSphere — Architecture

## Overview

EvoSphere is a client-only single-page application. All simulation logic lives under `src/simulation/`. UI and viewport rendering are separated from simulation state. Zustand holds UI/session state; the simulation engine owns tick state and snapshots.

```
┌─────────────────────────────────────────────────────────┐
│  React UI (command center, panels)                      │
│  src/ui/, src/components/                               │
└────────────────────┬────────────────────────────────────┘
                     │ reads panel state
┌────────────────────▼────────────────────────────────────┐
│  Zustand store — src/store/simulationStore.ts           │
└────────────────────┬────────────────────────────────────┘
                     │ will subscribe to snapshots (v0.2+)
┌────────────────────▼────────────────────────────────────┐
│  SimEngine — src/simulation/engine/SimEngine.ts         │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
  world/         agents/         civilization/
  genetics/      behavior/       culture/
  ecology/       technology/
```

## Directory Layout

| Path | Responsibility |
|------|----------------|
| `src/types/` | Shared TypeScript contracts |
| `src/utils/` | RNG and cross-cutting utilities |
| `src/store/` | Zustand UI / session state |
| `src/simulation/engine/` | Tick loop, snapshot assembly |
| `src/simulation/world/` | Terrain and climate generation |
| `src/simulation/agents/` | Agent entities and lifecycle |
| `src/simulation/genetics/` | Traits, inheritance, mutation |
| `src/simulation/behavior/` | Decision and movement rules |
| `src/simulation/ecology/` | Food webs, populations, biomes |
| `src/simulation/culture/` | Beliefs, rituals, transmission |
| `src/simulation/technology/` | Tools, discoveries |
| `src/simulation/civilization/` | Settlements, governance |
| `src/ui/panels/` | Command-center side panels |
| `src/ui/viewport/` | Pixi canvas host (v0.2) |
| `src/components/` | Top-level layout shells |

## Data Model (v0.1 types)

- **TerrainType** — biome enum for tiles
- **Tile** — spatial cell with elevation, moisture, temperature
- **World** — seeded grid of tiles plus tick counter
- **SimulationSettings** — seed, dimensions, tick rate
- **SimulationSnapshot** — lightweight tick summary for UI
- **EventLogEntry** — tick-indexed log row

## Deterministic RNG

`src/utils/rng.ts` wraps `seedrandom`. All procedural systems must derive child RNGs via `forkRng(seed, label)` so subsystems stay reproducible.

## Rendering (planned v0.2)

Pixi.js will mount inside `src/ui/viewport/`. The viewport reads snapshots — never mutates simulation state. Tile colors map from `TerrainType` initially; agents layer on later.

## Persistence (planned v0.5)

`idb` will store `SimulationSnapshot` history and settings. No network layer.

## Constraints

- No backend, no WebSocket, no external AI APIs
- 2D only (Pixi), no Three.js / WebGL 3D stack
- Read paths must not write simulation state (mirror BidSignal-style discipline for future GET-like UI reads)

## Build Pipeline

`npm run build` runs `tsc -b` then `vite build`. Tailwind v4 via `@tailwindcss/vite` plugin.
