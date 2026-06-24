# EvoSphere — Architecture

## Overview

EvoSphere is a client-only single-page application. Simulation logic lives under `src/simulation/`. UI and viewport rendering are separated from simulation state. Zustand holds UI/session state and mirrors engine snapshots; the simulation engine owns tick state, world data, and the event log.

```
┌─────────────────────────────────────────────────────────┐
│  React UI (command center, panels, runtime controls)    │
│  src/ui/, src/components/                               │
└────────────────────┬────────────────────────────────────┘
                     │ reads snapshot + UI state; calls store actions only
┌────────────────────▼────────────────────────────────────┐
│  Zustand store — src/store/simulationStore.ts           │
│  (overlay, selection, runtime loop, snapshot mirror)    │
└────────────────────┬────────────────────────────────────┘
                     │ owns single SimEngine instance
┌────────────────────▼────────────────────────────────────┐
│  SimEngine — src/simulation/engine/SimEngine.ts         │
│  world, tick, events, deep time, briefing assembly      │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
  world/         life/           agents/
  (v0.2 live)    (v0.3 live)     (v0.4+)
```

## Directory Layout

| Path | Responsibility |
|------|----------------|
| `src/types/` | Shared TypeScript contracts |
| `src/utils/` | RNG and cross-cutting utilities |
| `src/store/` | Zustand UI / session state + engine bridge + runtime loop |
| `src/simulation/engine/` | Tick loop, deep time, snapshot assembly, event log |
| `src/simulation/engine/simTime.ts` | Tick ↔ year ↔ generation mapping |
| `src/simulation/engine/briefing.ts` | Live world briefing from simulation state |
| `src/simulation/world/` | Deterministic terrain and climate generation |
| `src/simulation/life/` | Organism tick orchestration |
| `src/simulation/species/` | Species registry + speciation config |
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
- **SimulationSnapshot** — tick, worldId, full world, event log, life snapshot, briefing, last deep-time summary
- **EventLogEntry** — tick-indexed log row with category (life.*, world.*)

## SimEngine (v0.3.1)

- Constructs a `World` on init via `generateWorld()`
- Owns `LifeSystem` for all organism state
- Seeds founder life at suitable tiles on init/reset
- `step(count)` advances one or more ticks
- `runDeepTimeYears(years)` batch-steps with chunked ticks and emits `world.deep_time_summary`
- Emits throttled biological events: `life.first`, `life.bloom`, `life.die_off`, `life.extinction`, `life.speciation`, `life.colonization`, `life.population_shift`
- `getSnapshot()` includes full `life` snapshot, `briefing`, and `lastDeepTimeSummary`

## Simulation Time

| Unit | Mapping |
|------|---------|
| Tick | Atomic simulation step |
| Generation | ~25 ticks (estimate) |
| Simulated year | 10 ticks |

Deep-time buttons convert years → ticks via `yearsToTicks()`. Summaries report start/end tick and year.

## Runtime Loop

- `SimEngine` owns all mutation
- Zustand store mirrors snapshots after each step
- `requestAnimationFrame` loop in store (not React render) drives continuous run at 1×–1000×
- Deep time uses chunked stepping (`DEEP_TIME_CHUNK_SIZE = 250`) to avoid browser lockups
- UI calls store actions only; viewport is read-only

## Life System (v0.3.1)

```
LifeSystem
  ├── organisms[] — individual life entities
  ├── SpeciesRegistry — species counts, founder lineages, gated speciation
  ├── tileCounts[] / tileBiomass[] — per-tile density for overlays
  └── tick() — energy → metabolism → stress → death → reproduction
```

### Species clustering

- One **founder species per LifeKind** at seed time (`getOrCreateFounderSpecies`)
- Reproduction keeps offspring in parent species by default
- New species only when:
  - `childGeneration >= minGenerationsBeforeSpeciation` (default 8)
  - `geneticDistance > geneticDistanceThreshold` (default 0.18)
  - `parentSpeciesPopulation >= minPopulationForBranch` (default 12)

Modules:

| Path | Role |
|------|------|
| `simulation/life/LifeSystem.ts` | Tick orchestration + milestone events |
| `simulation/life/createLife.ts` | Organism factories |
| `simulation/genetics/genome.ts` | Base genomes per kind |
| `simulation/genetics/mutation.ts` | Offspring mutation + speciation gate |
| `simulation/ecology/energy.ts` | Energy gain and environmental stress |
| `simulation/ecology/colonization.ts` | Habitat suitability and carrying capacity |
| `simulation/species/speciesRegistry.ts` | Species tracking + founder lineages |
| `simulation/species/speciationConfig.ts` | Configurable speciation thresholds |

Population controls: max 4 organisms/tile, max 5000 total.

## Pixi Viewport

`WorldViewport` mounts a Pixi `Application` inside a React container:

- Reads `snapshot.world` and `overlayMode` from Zustand only
- Never mutates simulation state
- Supports pan, zoom, tile click → `selectTile`
- Climate overlays plus **life** and **biomass** density overlays with gamma-scaled visibility
- Highlights recent activity tiles (blooms/colonization) with amber outline
- Destroys Pixi app on unmount to avoid duplicate canvases

## UI Panels

| Panel | Content |
|-------|---------|
| World | Seed, runtime controls, deep time, world stats |
| Species | Alive species sorted by population |
| Events | Throttled milestone log with category colors |
| Inspector | Tile climate + top species on tile |
| Briefing | Era, dominant species, threats, deep-time recap |
| Roadmap | Phase plan |

## Why agents start in v0.4

The planetary substrate and observable microbial/plant life must be deterministic and inspectable before layering mobile agents and predation. v0.3.1 makes the simulation **feel alive** through runtime, deep time, and briefing — without adding animals yet.

## Constraints

- No backend, no WebSocket, no external AI APIs
- 2D only (Pixi), no Three.js / WebGL 3D stack
- Render path is read-only relative to simulation state

## Build Pipeline

`npm run build` runs `tsc -b` then `vite build`. Tailwind v4 via `@tailwindcss/vite` plugin.
