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
| `src/utils/` | RNG, deterministic monotonic IDs |
| `src/store/` | Zustand UI / session state + engine bridge + runtime loop |
| `src/simulation/engine/` | Tick loop, deep time, snapshot assembly, event log |
| `src/simulation/engine/simTime.ts` | Tick ↔ year ↔ generation mapping |
| `src/simulation/engine/briefing.ts` | Live world briefing from simulation state |
| `src/simulation/world/` | Deterministic terrain and climate generation |
| `src/simulation/life/` | Organism tick orchestration |
| `src/simulation/agents/` | Mobile agent tick orchestration (v0.4) |
| `src/simulation/behavior/` | Mobile goal selection and movement |
| `src/simulation/disasters/` | Natural disaster types, effects, tick system (v0.5.3) |
| `src/simulation/engine/eraPacing.ts` | Era-inferred pacing profiles + Auto Pace speed selection |
| `src/simulation/world/originProfiles.ts` | Deterministic varied founder-life origin profiles |
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

## Deep-Time Pacing (v0.5.3)

| Era phase | Auto Pace speed | Batch multiplier |
|-----------|-----------------|------------------|
| Abiogenesis / Microbial | Ultra Fast | 3× |
| Multicellular | Super Fast | 2.5× |
| Complex Ecosystem | Fast | 2× |
| Proto-Sentient+ (scaffold) | Normal | ≤1× |

Auto Pace infers phase from life/agent state — no civilization fields yet. Manual Live/Fast/Super/Ultra override Auto Pace.

## Natural Disasters (v0.5.3)

```
DisasterSystem
  ├── inject / random / tick lifecycle
  ├── tile stress (water, fertility, temperature, biomass burn, mortality)
  ├── life + agent mortality/biomass effects
  └── throttled event log (disaster.started, disaster.ended, disaster.mass_dieoff, …)
```

Disasters alter real simulation state — drought lowers water, wildfire burns biomass, ice pulse shifts biomes where feasible.

## Abiotic Terrain vs Biotic Ecosystem (v0.5.4)

| Field | Role |
|-------|------|
| `tile.terrain` | Abiotic substrate at worldgen (barren, basin, fertile_plain, ocean, …) |
| `tile.ecosystem` | Life-created overlay (`none` → grassland/forest/swamp via succession) |
| `tile.successionStage` | Ecological stage (microbial → mature) |
| `tile.disturbanceLevel` | Disaster/overgrazing regression pressure |

Worldgen never assigns forest/grassland/swamp/marsh as terrain. `visualTerrainForTile()` merges ecosystem for rendering.

## Ecological Succession (v0.5.4)

`ecology/succession.ts` — producer biomass, water, stability, herbivory, disturbance drive ecosystem emergence. Throttled events: `ecology.biome_emerged`, `ecology.forest_emerged`, etc.

## Disaster Pacing + Safe Mode (v0.5.4)

`config/disasterConfig.ts` — frequency rare/normal/harsh/chaos/manual_only, mass extinctions very rare, refugia preserved in safe mode, natural roll every 1000 ticks with early-life protection.

## Proto-Cognition (v0.5.4)

```
MobileAgent
  ├── controller (NeuralController) — fixed-size weights + learned bias
  ├── memory (AgentMemory) — food/danger/preferences
  └── goalFromController() blends with utility behavior

SpeciesRegistry.memoryStore — species-level habitat learning
```

No external AI. Reinforcement on meaningful events only.

## Speciation Pipeline (v0.5.4)

Variant → subspecies → species via `evaluateBranchCandidate()` — local fitness, founder group, establishment grace, failed variants marked quietly.

## Determinism + Reset Replay (v0.5.4b)

Sim-critical IDs use monotonic counters in `src/utils/deterministicId.ts` (reset on `SimEngine` construct + reset). Mutation RNG forks use `{speciesId, x, y, generation, tick}` — not entity IDs from `nanoid`.

Registry iteration for establishment and genome matching sorts by species id for stable tie-breaks. Event log timestamps use sim tick (not `Date.now()`).

Headless gate: `npm run qa:determinism` — 5000 ticks, compares organisms/agents/biomass/species/disasters between first run, reset replay, and fresh engine.

## Worker Disaster Settings Sync (v0.5.4b)

`MainToWorkerMessage.setDisasterSettings` → `workerClient.setDisasterSettings()` → `simWorker` applies to `DisasterSystem.setSettings()`. Store syncs on UI change and after worker bootstrap. Soak HUD shows `dis-sync @tick` when synced.

## Origin Profiles (v0.5.3)

Each generated world stores `world.originProfile` with founder tile IDs, biome types, energy sources, and explanation for Briefing/event log. Same seed → same profile; different seeds → varied origins.

## Runtime Loop (v0.5.2)

```
Main thread                          Worker thread (default)
────────────                         ────────────────────────
React UI + Zustand                   SimEngine + world + life + agents
Pixi render (snapshot consumer)  ←── compact snapshots (typed arrays, backpressure)
Input / camera / inspection          Deep time + QA benchmarks
Animation RAF (animated layers only) Worker speed schedules + snapshot rate cap
```

### Crash root cause (v0.5.2)

Normal-speed browser crash at ~simulated year 4 was **not** simulation runaway (headless QA reaches year 10 with ~109 organisms). It was a **Pixi render leak**:

1. Animation RAF called full redraw every frame with `force=true`
2. Each redraw created new `Graphics()` objects per layer
3. `clearLayer()` used `removeChildren()` without `destroy()` → GPU resources accumulated until tab death

Fix: persistent layer `Graphics` cleared with `.clear()`; terrain redraw only on world change or snapshot; animated layers on RAF only.

### Snapshot backpressure (v0.5.2)

| Mechanism | Location |
|-----------|----------|
| Max 2 pending snapshots on main | `workerClient.ts`, `MAX_PENDING_SNAPSHOTS` |
| Latest-wins drop when UI behind | `workerClient.ts` queue |
| Worker snapshots/sec cap (20) | `simWorker.ts`, `MAX_WORKER_SNAPSHOTS_PER_SEC` |
| `snapshotConsumed` ack | worker ↔ main protocol |
| HMR worker terminate | `simulationStore.ts` `import.meta.hot.dispose` |

### Long-run soak telemetry (v0.5.2b)

| Mechanism | Location |
|-----------|----------|
| Rolling heap trend + birth/death intervals | `soakTelemetry.ts` |
| Soak Debug HUD + warnings | `SoakDebugHUD.tsx`, `WorldViewport.tsx` |
| Terrain/glyph cache bounds + destroy on reset | `renderCache.ts`, `stabilityGuards.ts` |
| RAF/worker singleton guards | `lifecycleGuards.ts` |
| Headless yr-25 table | `scripts/qa-longrun.ts` |

### Focus / camera modes (v0.5.2b)

| Mode | Behavior |
|------|----------|
| `free` | User pan/zoom; planet bounds clamp |
| `focused_tile` | One-shot zoom on tile select |
| `focused_species` | One-shot zoom on species Focus |
| `following_species` | Soft pan to species centroid via `followPanTarget` (not focus-request spam) |
| `inspecting_agent` | Agent click on tile |

Manual pan/wheel sets `userCameraOverride` and disables follow unless **Locked follow** is on. ESC + Exit Focus return to free mode and reset camera.

### Secondary crash root cause (v0.5.2b)

Follow-selected-species called `focusTile()` on every snapshot refresh, incrementing `cameraFocusSeq` and forcing camera jumps — trapping the user and adding main-thread churn alongside render work. Fixed by soft follow pan in viewport RAF + explicit escape controls.

### Rust/WASM decision gate (v0.5.2 evidence)

| Option | Recommendation |
|--------|----------------|
| TypeScript worker + bug fix + SoA Phase B | **BUILD NOW** — crash was render/leak; lifeTick still top bottleneck (87%) but sim is stable |
| Rust/WASM hot-loop port | **SPIKE ONLY** after SoA Phase B if lifeTick still >70% — not justified for render leaks |
| Bevy native rewrite | **DEFER** — rewrite path, not patch; only if standalone game becomes goal |
| Bevy web/WASM | **DEFER** — same as native unless browser demo abandoned |

## Runtime Loop (v0.5.1)

```
Main thread                          Worker thread (default)
────────────                         ────────────────────────
React UI + Zustand                   SimEngine + world + life + agents
Pixi render (snapshot consumer)  ←── compact snapshots (typed arrays)
Input / camera / inspection          Deep time + QA benchmarks
Animation RAF (display FPS)          Worker speed schedules (higher batch)
```

- **`WORKER_SIMULATION_ENABLED`** — `src/simulation/config/simConfig.ts`; falls back to v0.4.3 main-thread loop if worker fails
- **Worker protocol** — `workerTypes.ts`, `workerProtocol.ts`, `simWorker.ts`, `workerClient.ts`
- **Snapshot codec** — render / inspector / full / deep-time summary modes; avoids shipping every organism object each frame
- **Performance profiler** — `performanceProfiler.ts` tracks lifeTick, agentTick, snapshotBuild, briefingBuild, renderRedraw
- Main-thread fallback retains **time-budgeted stepping** (`simScheduler.ts`) from v0.4.3

| Speed | Main thread (fallback) | Worker (default) |
|-------|--------------------------|------------------|
| Normal | 1 tick/frame, full snapshots | 2 ticks/loop, snapshot ~50ms |
| Fast | ~4 ticks/frame budget | 12 ticks/loop |
| Super Fast | ~8 ticks/frame budget | 48 ticks/loop, lighter briefing |
| Ultra Fast | ~12 ticks/frame budget | 160 ticks/loop, progress throttling only |

High-speed modes are **sim batch multipliers**, not render-frame multipliers. Visual playback uses interpolation between throttled snapshots.

## Rust/WASM escalation path (not step one)

| Phase | Scope |
|-------|--------|
| A | TypeScript Worker + compact snapshots **(v0.5.1 — current)** |
| B | Typed-array ECS / full Agent SoA tick migration |
| C | Rust/WASM hot loops for LifeSystem / AgentSystem / SenseSystem if profiling proves TS worker ceiling |
| D | WebGPU compute or native Bevy only if browser ceiling blocks project goals |

Profile before rewrite. Language switch is escalation, not first move.

## Runtime Loop (v0.4.3 — fallback path)

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

## Body Plans + Senses + Selection (v0.5)

```
MobileAgent
  ├── genome (MobileGenome)
  ├── bodyPlan (BodyPlan) — derived + slowly mutated
  ├── senses (SensoryProfile) — derived from genome + body plan
  ├── sensoryInput — bounded local scan each tick
  └── environmentalFitness / habitatStress — from tile + ecology
```

| Module | Role |
|--------|------|
| `bodyPlan/bodyPlanGenome.ts` | Derive body plan from genome + archetype |
| `bodyPlan/bodyPlanMutation.ts` | Slow body-plan mutation on reproduction |
| `senses/SenseSystem.ts` | Sensory range derivation |
| `behavior/sensoryTargets.ts` | Local O(range²) environment scan |
| `ecology/environmentalFitness.ts` | Tile fitness, movement/reproduction multipliers |
| `species/speciesSelectionMetrics.ts` | Aggregate species selection profiles + narratives |

Behavior uses utility scoring (not complex AI): goals from hunger, senses, fitness, predator pressure.

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

Population controls: max 3 agents/tile (tracked). **v0.5.4c:** mobile reserve pools when tracked budget full; legacy 800 cap demoted.

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

Population controls: max 4 organisms/tile (tracked), max 3 agents/tile (tracked). **v0.5.4d:** biological population scales via cohort/patch/bloom units (`populationUnits.ts`); simulation record count bounded (~1800 units). Tracked/render budgets unchanged.

## v0.5.4e — Seed diversity, extinction forensics, representative rendering cap

| Layer | Role |
|-------|------|
| **Origin scenarios** | `originScenarios.ts` — abiogenesis, panspermia, speculative seeder, random mixed |
| **World archetypes** | `worldArchetypes.ts` — sea level, moisture, vents, ridges, polar ice modifiers |
| **Extinction forensics** | `extinctionForensics.ts` — decline causes, aggregate compression flags, planet.extinction |
| **Render budget** | `renderBudget.ts` — sampled moving glyphs (160 default / 300 hard), density-only far zoom |
| **Reseed** | `lifeReseed.ts` + `SimEngine.reseedLife()` — vent/meteor/coastal/alien (speculative labeled) |

Headless gates: `npm run qa:world-variety` · `npm run qa:render-budget` · `npm run qa:extinction-forensics`

## v0.5.4d — Population units + cohort representation

| Layer | Role |
|-------|------|
| **Estimated biological population** | Sum of `representedIndividuals` across tracked entities + cohort units |
| **Population units** | Bounded cohort/patch/bloom records — merge when budget exceeded |
| **Tracked individuals** | Performance budget — visible representatives for inspection/movement |
| **Rendered entities** | Pixi draw caps — LOD/culling only |

Ultra crash root cause (browser ~14K biological pop): unbounded `species@tile` aggregate pools (MAX_POOLS 8000), full `speciesOccupancy.tileIndices` JSON per snapshot, and `[...tileCounts]` copies every snapshot.

Key paths:

| Path | Role |
|------|------|
| `simulation/ecology/populationUnits.ts` | Cohort/patch/bloom store |
| `simulation/ecology/representationScale.ts` | Species-specific individuals-per-unit policy |
| `simulation/ecology/populationUnitOps.ts` | Deterministic merge/split |
| `simulation/ecology/carryingCapacity.ts` | Dynamic per-tile and world carrying capacity |
| `simulation/ecology/populationConfig.ts` | World-size-scaled budgets |
| `simulation/species/speciesOccupancy.ts` | Capped tile index occupancy (64/species) |

Headless gates: `npm run qa:representation` · `npm run qa:population` · `npm run qa:determinism`

## v0.5.4c — Population architecture (superseded by v0.5.4d units)

| Layer | Role |
|-------|------|
| **Biological population** | Tracked individuals + aggregate pools — drives ecology, speciation, food web |
| **Tracked individuals** | Performance budget (`populationConfig.ts`) — representative organisms/agents |
| **Rendered entities** | Pixi draw caps — LOD/culling only |

Key paths:

| Path | Role |
|------|------|
| `simulation/ecology/carryingCapacity.ts` | Dynamic per-tile and world carrying capacity |
| `simulation/ecology/aggregatePopulation.ts` | Aggregate producer/mobile pools |
| `simulation/ecology/populationConfig.ts` | World-size-scaled budgets |
| `simulation/evolution/bottleneckRecovery.ts` | Bottleneck kind taxonomy |

Headless gates: `npm run qa:population` · `npm run qa:determinism` (5000 ticks, biological + tracked fingerprint)

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
