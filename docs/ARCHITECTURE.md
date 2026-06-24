# EvoSphere — Architecture

## Overview

EvoSphere is a client-only single-page application. Simulation logic lives under `src/simulation/`. UI and viewport rendering are separated from simulation state. Zustand holds UI/session state and mirrors engine snapshots; the simulation engine owns tick state, world data, and the event log.

```
┌─────────────────────────────────────────────────────────┐
│  React UI (command center, panels)                      │
│  src/ui/, src/components/                               │
└────────────────────┬────────────────────────────────────┘
                     │ reads snapshot + UI state
┌────────────────────▼────────────────────────────────────┐
│  Zustand store — src/store/simulationStore.ts           │
│  (overlay, selection, seed controls, snapshot mirror)   │
└────────────────────┬────────────────────────────────────┘
                     │ owns single SimEngine instance
┌────────────────────▼────────────────────────────────────┐
│  SimEngine — src/simulation/engine/SimEngine.ts         │
│  world, tick, events                                    │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
  world/         agents/         civilization/
  (v0.2 live)    (v0.3+)         (v0.4+)
```

## Directory Layout

| Path | Responsibility |
|------|----------------|
| `src/types/` | Shared TypeScript contracts |
| `src/utils/` | RNG and cross-cutting utilities |
| `src/store/` | Zustand UI / session state + engine bridge |
| `src/simulation/engine/` | Tick loop, snapshot assembly, event log |
| `src/simulation/world/` | Deterministic terrain and climate generation |
| `src/simulation/agents/` | Agent entities (v0.3+) |
| `src/ui/panels/` | Command-center side panels |
| `src/ui/viewport/` | Pixi canvas host + tile color maps |

## Deterministic World Generation (v0.2)

World generation is fully seed-driven:

1. **Elevation** — four-octave fractal noise from `forkRng(seed, 'elevation')` lattices
2. **Moisture** — three-octave noise from `forkRng(seed, 'moisture')`
3. **Temperature** — latitude band (poles colder) minus elevation lapse rate
4. **Terrain classification** — elevation thresholds for ocean/deep ocean/coast; moisture + temperature for land biomes
5. **Rivers** — downhill traces from high-elevation moist sources
6. **Volcanic / hydrothermal** — sparse deterministic placement on mountains and deep ocean
7. **Derived attributes** — water, soil fertility, resource deposits computed per tile

Same `SimulationSettings` (seed, width, height) always yields identical `Tile[]`. Different seeds yield different worlds. No `Math.random()`.

## Data Model

- **TerrainType** — biome enum (deep_ocean, ocean, coast, grassland, forest, desert, mountain, river, tundra, swamp, volcanic, hydrothermal_vent)
- **Tile** — spatial cell with elevation, moisture, temperature, water, soilFertility, resourceDeposits
- **World** — seeded grid of tiles plus tick counter
- **SimulationSnapshot** — tick, worldId, full world, event log
- **EventLogEntry** — tick-indexed log row

## SimEngine (v0.2)

- Constructs a `World` on init via `generateWorld()`
- Emits `world.generated` on creation
- `step()` advances tick; emits `world.tick` every 50 ticks
- `reset()` regenerates world from current or overridden settings
- No population or species fields — intentionally absent until v0.3

## Pixi Viewport

`WorldViewport` mounts a Pixi `Application` inside a React container:

- Reads `snapshot.world` and `overlayMode` from Zustand only
- Never mutates simulation state
- Supports pan, zoom, tile click → `selectTile`
- Six overlay modes: terrain, elevation, moisture, temperature, water, fertility
- Destroys Pixi app on unmount to avoid duplicate canvases

## Why agents start in v0.3

The planetary substrate must be observable, deterministic, and inspectable before layering life. v0.2 validates seed reproducibility, climate attribute distribution, and render performance. v0.3 adds microbes/plants on top of real fertility and water values — not placeholder lore.

## Constraints

- No backend, no WebSocket, no external AI APIs
- 2D only (Pixi), no Three.js / WebGL 3D stack
- Render path is read-only relative to simulation state

## Build Pipeline

`npm run build` runs `tsc -b` then `vite build`. Tailwind v4 via `@tailwindcss/vite` plugin.
