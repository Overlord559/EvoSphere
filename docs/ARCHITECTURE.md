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
  (v0.2 live)    (v0.3 live)     (v0.4 live)
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
| `src/simulation/agents/` | Mobile agent tick orchestration (v0.4) |
| `src/simulation/behavior/` | Mobile goal selection and movement |
| `src/simulation/ecology/` | Energy, colonization, herbivory, predation, food web |
| `src/ui/panels/` | Command-center side panels |
| `src/ui/viewport/` | Pixi canvas host, organic biome renderer, creature/plant glyphs, visual genes |

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

## Runtime Loop (v0.4.3)

- `SimEngine` owns all mutation; ticks are **internal only**
- Zustand `requestAnimationFrame` loop uses **time-budgeted stepping** (`simScheduler.ts`)
- Speed modes cap work per frame (~10ms budget); never blocks main thread with 100-tick batches
- Snapshots throttled by tick interval + ms interval per speed mode
- `renderSnapshotVersion` drives viewport redraw; animation RAF separate from snapshot cadence
- Deep time remains chunked, cancellable, async UI sync

| Speed | Behavior |
|-------|----------|
| Normal | 1 tick/frame, full snapshot every tick |
| Fast | ~4 ticks/frame budget, snapshot every 2 ticks / 80ms |
| Super Fast | ~8 ticks/frame budget, lighter briefing, snapshot every 6 ticks |
| Ultra Fast | ~12 ticks/frame budget, snapshot every 12 ticks / 180ms |

Throttle states: `ok` · `catching_up` · `throttled` · `overloaded` — surfaced in controls + viewport

## Circular Planet (v0.4.3)

- `World.activeMask[]` — false outside planet radius
- `void` terrain for inactive tiles — dark space in viewport
- Life/agents cannot spawn, move, or reproduce on void tiles
- Edge falloff biases rim tiles toward ocean/coast
- `getTileAt()` returns undefined for void; `getTileAtRaw()` for inspector

## World Size Presets (v0.4.3)

| Preset | Size | Default |
|--------|------|---------|
| small | 96×96 | |
| standard | 192×192 | ✅ |
| large | 256×256 | |
| experimental | 384×384 | explicit opt-in |

## Viewport Culling + LOD (v0.4.3)

- `viewportCulling.ts` — visible tile bounds from pan/zoom
- Terrain/plants/agents drawn only in view + margin
- LOD: far / medium / close glyph detail by zoom
- Draw caps: agents 400–800, plant tiles 2000, detailed glyphs 120
- Reused Graphics containers per layer (not per-tile objects)

## Runtime Loop (v0.4.2 — superseded)

## Simulated Time (v0.4.2)

| Unit | Mapping | UI visibility |
|------|---------|---------------|
| Tick | Internal atomic step | Debug mode only |
| Simulated year | 10 ticks | Primary display |
| Generation | ~25 ticks (estimate) | Briefing / World panel |
| Era | Derived from life state | Briefing header |

Eras: Abiogenesis / Simple Life → Early Photosynthetic → Primitive Plant Colonization → Early Food Web → Predator-Prey World

## Runtime Loop (v0.3.2 — superseded)

## SimEngine (v0.4)

- Constructs `LifeSystem` + `AgentSystem` on init
- Seeds founder life, then mobile agents on suitable tiles
- `step()` runs life tick then agent tick each tick
- `stepDeepTimeBatch()` runs both systems with events suppressed
- `getSnapshot()` includes `life`, `agents`, and combined species occupancy
- Deep-time summary includes grazer/predator deltas, predation count, starvation count

## Agent System (v0.4)

```
AgentSystem
  ├── agents[] — mobile entities (SimpleGrazer, SimplePredator, Scavenger)
  ├── FoodWebTracker — predator/prey link counts
  ├── tileAgentCounts[] — per-tile density for movement caps + viewport
  └── tick() — hunger → goal → move/graze/hunt → death → reproduction
```

Population controls: max 3 agents/tile, max 800 globally.

| Path | Role |
|------|------|
| `simulation/agents/AgentSystem.ts` | Tick orchestration + milestone events |
| `simulation/agents/createAgent.ts` | Agent factories |
| `simulation/genetics/agentGenome.ts` | Base mobile genomes |
| `simulation/genetics/agentMutation.ts` | Offspring mutation + speciation gate |
| `simulation/behavior/mobileBehavior.ts` | Goals, movement, flee, migration |
| `simulation/ecology/herbivory.ts` | Grazing energy + terrain costs |
| `simulation/ecology/predation.ts` | Hunt resolution |
| `simulation/ecology/foodWeb.ts` | Predator/prey link tracking |

## SimEngine (v0.3.2)

- `stepDeepTimeBatch(n)` — fast batched ticks without periodic events or full snapshot assembly
- `startDeepTimeCapture` / `finalizeDeepTime` — async-friendly deep-time with runtime seconds + selected species delta
- `getSnapshotWithSelectedSpecies(id)` — briefing includes selected-species block
- Deep-time chunk size: **5000 ticks** internal; UI sync every 2 chunks

## Species selection (v0.3.2)

- `selectedSpeciesId` lives in Zustand only — SimEngine unchanged
- `LifeSnapshot.speciesOccupancy` — precomputed per species: tile indices, avg stats, dominant terrain
- Viewport draws violet overlay only on occupied tile indices (O(tiles occupied), not O(all tiles × organisms))

## Deep-time performance (v0.3.2)

| Optimization | Effect |
|--------------|--------|
| O(1) `liveTileCounts` vs O(n) filter per reproduction check | Major tick speedup |
| Skip population events + species history during batch suppress | Less per-tick overhead |
| In-place world.tick mutation | Avoid object spread per tick |
| Lightweight snapshot during batch (`includeOrganisms: false`) | Less allocation in hot path |
| 5K tick internal chunks | Fewer boundary overheads |

Benchmark (Node, seed `evosphere-prime`): +1K yr ~16s · +10K yr ~132s (vs ~704s v0.3.1)

## Life System (v0.3.2)

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
| `simulation/species/speciesOccupancy.ts` | Occupancy index + threat heuristics |

Population controls: max 4 organisms/tile, max 5000 total.

## Pixi Viewport (v0.4.1)

`WorldViewport` mounts a Pixi `Application` inside a React container with layered rendering:

| Module | Role |
|--------|------|
| `renderLayers.ts` | Terrain → plants → agents → species highlight → activity → selection |
| `biomeRenderer.ts` | Organic per-biome textures (not flat square tiles) |
| `plantGlyphs.ts` | Aggregate producer glyphs by tile density/biomass |
| `agentGlyphs.ts` | Procedural creature silhouettes from agent kind + genome |
| `visualGenes.ts` | Trait → visual parameter mapping; zoom detail tiers |
| `organismRenderer.ts` | Orchestrates full world draw; organic vs debug mode |
| `InspectorPreview.tsx` | Mini Pixi preview in Inspector panel |
| `tileColors.ts` | Overlay color maps (terrain, life, biomass, climate) |

- Reads `snapshot.world`, `overlayMode`, `visualMode` from Zustand only
- Never mutates simulation state
- Supports pan, zoom (detail tier changes with zoom), tile click → `selectTile`
- Climate overlays plus **life** and **biomass** density overlays
- Highlights **selected species** tiles with violet fill + outline
- **Organic mode** (default): biomes + glyphs; **Debug mode**: flat tiles + dots
- Destroys Pixi app on unmount

### Visual gene mapping

| Trait | Visual effect |
|-------|---------------|
| speed | leg count, appendage length, slimmer body |
| stamina | body scale |
| sensoryRange | eye scale, antenna count, second eye at close zoom |
| huntingEfficiency | mouth/jaw size, claws |
| grazingEfficiency | wider beak/mouth |
| aggression | angular body, spines |
| fearfulness | compact posture |
| waterTolerance | fin emphasis |
| biomass / health / energy | glyph size, opacity, brightness |

### Zoom detail

| Zoom | Detail |
|------|--------|
| &lt; 1.5 | Simplified shaped glyphs |
| 1.5 – 3 | Body + head + basic appendages |
| ≥ 3 | Full mouths, eyes, tails, legs, antennae, plant branches |

## Pixi Viewport (v0.3.2 — superseded by v0.4.1 layers)

## UI Panels

| Panel | Content |
|-------|---------|
| World | Seed, runtime controls, deep time, world stats |
| Species | Alive species, click to select/focus, occupancy summary |
| Events | Throttled milestone log with category colors |
| Inspector | Tile climate + clickable top species |
| Briefing | World or selected-species briefing + deep-time recap |
| Roadmap | Phase plan |

## Why agents start in v0.4

The planetary substrate and observable microbial/plant life must be deterministic and inspectable before layering mobile agents and predation. v0.3.1 makes the simulation **feel alive** through runtime, deep time, and briefing — without adding animals yet.

## Constraints

- No backend, no WebSocket, no external AI APIs
- 2D only (Pixi), no Three.js / WebGL 3D stack
- Render path is read-only relative to simulation state

## Build Pipeline

`npm run build` runs `tsc -b` then `vite build`. Tailwind v4 via `@tailwindcss/vite` plugin.
