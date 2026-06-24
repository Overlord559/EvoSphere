# EvoSphere — Roadmap

## v0.1 Foundation ✅

- [x] Vite + React + TypeScript scaffold
- [x] Dependencies: pixi.js, zustand, seedrandom, nanoid, idb, tailwindcss
- [x] Shared simulation types
- [x] Folder structure for all major systems
- [x] Deterministic RNG utility
- [x] Command-center UI shell
- [x] Project documentation

## v0.2 World + Viewport ✅

- [x] Procedural world generator from seed
- [x] Tile grid with terrain types and climate attributes
- [x] Pixi.js viewport — pan/zoom tile map with overlays
- [x] SimEngine tick loop with world state
- [x] Event log (world generated, reset, periodic ticks)
- [x] Wire viewport and panels to simulation snapshots
- [x] Tile selection and inspector panel

## v0.3 Life ✅

- [x] Life entity types: Microbe, PhotosyntheticMicrobe, ChemosyntheticMicrobe, Algae, PrimitivePlant
- [x] Genome with reproduction, mutation, tolerance, and efficiency traits
- [x] Energy gain from sunlight, water, chemicals, and fertility
- [x] Metabolism, environmental stress, starvation, and age death
- [x] Reproduction with mutation and speciation events
- [x] Per-tile carrying capacity + global organism cap
- [x] Founder seeding at hydrothermal vents, aquatic zones, fertile land
- [x] Species panel with live counts and biomass
- [x] Life and biomass viewport overlays
- [x] Biological event log

## v0.3.2 Species Highlight + Performance ✅

- [x] `selectedSpeciesId` in Zustand — select / focus / clear
- [x] Species panel clickable rows with summary stats
- [x] Viewport violet highlight for selected species tile occupancy
- [x] Inspector cross-link — click species on tile to select
- [x] Briefing panel selected-species mode
- [x] Precomputed `speciesOccupancy` in life snapshot
- [x] Deep-time batch stepping (5K ticks/chunk), O(1) tile counts
- [x] Deep-time progress UI + runtime in summary
- [x] ~5× faster +10K yr vs v0.3.1 sync benchmark (exact ticks preserved)

## v0.4.3 Stability + Bigger Circular World + Zoom Inspection ✅ (current)

- [x] Time-budgeted sim scheduler — ms/frame budget, max ticks/frame, graceful degrade
- [x] Snapshot throttling — internal tick vs lastSnapshotTick vs renderSnapshotVersion
- [x] Circular planet mask — activeMask, void terrain, edge falloff, no life outside circle
- [x] World size presets — 96 / 192 / 256 / 384
- [x] Viewport culling + LOD — visible tiles only, zoom-tier glyph detail, draw caps
- [x] Zoom/focus inspection — tile/agent click, species Focus, Inspector/Briefing zoom-to
- [x] Stability guards — quarantine NaN/invalid entities, population warnings, event caps
- [x] Performance HUD — FPS, sim ms, drawn counts, LOD, throttle (Debug/Advanced)
- [x] Pause-while-inspecting + follow-selected-species toggles

## v0.4.2 Real-Time Living Simulation UX + Time Semantics ✅

- [x] Simulated time display (years, eras, generations) — ticks demoted to debug
- [x] Play-first controls: Normal, Fast Forward, Super Fast, Ultra Fast
- [x] Manual step moved to Advanced/Debug controls only
- [x] Smooth agent tile interpolation in viewport
- [x] Living animation layer (creatures, plants, biomes, selection glow)
- [x] Latest Developments feed from real state/events
- [x] Deep Time: progress bar, current year, elapsed/ETA, cancel, summary
- [x] Auto-play on app load

## v0.4.1 Spore-Inspired Visual Biology + Biome Renderer ✅

- [x] Organic biome renderer — textured terrain per biome type
- [x] Procedural plant/producer glyphs keyed to density and biomass
- [x] Spore-inspired mobile creature glyphs (grazer / predator / scavenger)
- [x] Visual gene mapping from real genome traits
- [x] Zoom-tier rendering detail (far / medium / close)
- [x] Selected species agent glow + tile highlight + producer highlight
- [x] Inspector visual preview with species stats and traits
- [x] Organic (default) / Debug visual mode toggle
- [x] Performance caps — agent draw limits scale with zoom tier

## v0.4 Mobile Agents + Predation + Food Webs ✅

- [x] Mobile agent kinds: SimpleGrazer, SimplePredator, Scavenger
- [x] Mobile genome traits (speed, stamina, hunting, grazing, aggression, fearfulness, …)
- [x] Deterministic movement, goals, and energy costs
- [x] Herbivory — grazers consume producer biomass with overgrazing pressure
- [x] Predation — predators hunt grazers/scavengers with energy transfer
- [x] Food web links, trophic roles, predator/prey species panel integration
- [x] Viewport mobile agent dots (green grazers, red predators, amber scavengers)
- [x] Throttled agent + food-web milestone events
- [x] Deep-time summary includes grazer/predator deltas, predation, starvation counts

## v0.5.3 Deep-Time Pacing + Camera/Selection + Procedural World Variety + Cataclysms ✅ (current)

- [x] Cursor-centered zoom — `zoomAtScreenPoint` in `cameraController.ts`
- [x] Selection/inspection guards — no sim mutation; extinct species clear; tile void-safe
- [x] Era pacing + Auto Pace — `eraPacing.ts`, era-inferred speed budgets
- [x] Fast mode usefulness — increased scheduler/worker batch sizes, era multipliers
- [x] Origin profiles — deterministic varied founder sites per seed
- [x] Biome variety — snow, marsh, mountain ridges, improved classification
- [x] Biome visuals — distinct swamp/marsh/tundra/snow/mountain rendering
- [x] Natural disaster system — 13 disaster types with real state effects
- [x] Disaster UI — inject, random, severity, Briefing active list, stress overlay
- [x] Latest Developments — disaster/evolution summaries from real events/deltas
- [x] QA — `npm run qa:worldgen` + existing stability/performance gates

## v0.5.2b Long-Run Browser Soak + Focus Escape UX ✅

- [x] Soak Debug HUD — heap trend, snapshot backlog, Pixi counts, cache sizes, RAF/worker counts, warnings
- [x] Focus escape — Exit Focus, Zoom Out, Reset Camera, Stop Following, Fit Planet, ESC
- [x] Camera modes — free / focused_tile / focused_species / following_species / inspecting_agent
- [x] Follow fix — soft pan via `followPanTarget`; manual input disables follow unless locked
- [x] Lifecycle guards — bounded caches, species pop history cap, worker/RAF singleton telemetry
- [x] `npm run qa:longrun` — headless yr 25 table every 5 yr + browser manual checklist

## v0.5.2 Crash Forensics + Runaway Fix ✅

- [x] Pixi render leak fix — persistent layer Graphics, destroy-on-clear fallback, animated vs full redraw
- [x] Worker snapshot backpressure — pending cap, latest-wins, snapshots/sec limit, consume ack
- [x] Safety caps — births/tick, stability guard interval, lightweight population counts
- [x] Crash health HUD — heap, snapshot bytes, pending snapshots, Pixi count, crash risk
- [x] `npm run qa:crash-repro` — year 10 runaway/leak gate with telemetry samples
- [x] Rust/WASM decision gate documented — TS worker + SoA Phase B first; WASM spike only if lifeTick still dominates

## v0.5.1 Workerized Performance Architecture ✅

- [x] Performance profiler — subsystem timings, debug table, top-5 bottlenecks
- [x] Web Worker simulation — `simWorker.ts` owns `SimEngine`; main thread renders only
- [x] Worker protocol — init/play/pause/speed/snapshot/deep-time/cancel messages
- [x] Compact snapshots — render / inspector / full modes; typed-array tile + agent buffers
- [x] Feature flag + main-thread fallback — `WORKER_SIMULATION_ENABLED`
- [x] Worker speed schedules — Super Fast / Ultra Fast batch in worker without main-thread lock
- [x] Render decoupling — terrain cache by worldId; agent/overlay layers on snapshot version
- [x] Agent SoA Phase A — mirror hot fields for snapshot encoding; Phase B migration documented
- [x] QA performance script — `npm run qa:performance`

## v0.5 Body Plans + Senses + Environmental Selection ✅

- [x] Body plan model on mobile agents (symmetry, locomotion, mouth, armor, sensors, adaptations)
- [x] Body plan genetics — derived from genome, slow mutation on reproduction
- [x] Sensory profiles — vision/smell/vibration/heat/water/pressure ranges affect behavior
- [x] Environmental fitness — terrain/climate/biomass/predation/crowding affect movement, energy, reproduction, stress
- [x] Species selection metrics — fitness, habitat, body plan, senses, pressures in Species + Briefing panels
- [x] Visual integration — agent glyphs reflect body plan traits
- [x] Behavior integration — utility goals use senses + fitness + predator pressure
- [x] Stability QA gate script — Standard 192×192 all speed modes + deep time smoke test

## v0.5.4 — Proto-Cognition + Ecological Succession + Adaptive Radiation ✅

- [x] Abiotic substrate vs biotic ecosystem tile fields
- [x] Worldgen — no forest/grassland/swamp/marsh at birth
- [x] Ecological succession — `ecology/succession.ts`
- [x] Disaster pacing + safe mode — `config/disasterConfig.ts`
- [x] Bottleneck recovery + adaptive radiation
- [x] Variant → subspecies → species speciation pipeline
- [x] Proto-cognition — `cognition/NeuralController.ts`, learning, species memory
- [x] UI — Briefing succession/recovery, Species variants, Inspector cognition, disaster controls
- [x] QA — `qa:succession`, `qa:evolution`

## v0.5.4c — Population Cap Architecture + Adaptive Carrying Capacity ✅ (current)

- [x] Aggregate population pools for producers and mobile reserve when tracked budget full
- [x] Dynamic carrying capacity — habitat, succession, biomass, trophic role, crowding
- [x] World-size-scaled population config — tracked vs rendered vs safety ceilings
- [x] Bottleneck taxonomy — artificial cap vs ecological vs plateau vs expansion failure
- [x] Cap-pressure dispersal/evolution events
- [x] Briefing + Soak HUD population architecture telemetry
- [x] QA — `qa:population` · updated stability/performance/determinism gates
- [ ] v0.6 Communication + Social Learning — **blocked** until browser soak passes

## v0.5.4b — Browser Soak + Determinism + Worker Disaster Sync ✅

- [x] Deterministic monotonic IDs — `src/utils/deterministicId.ts`; no `nanoid` in sim tick paths
- [x] Reset replay exact match — sorted registry iteration; mutation RNG keyed by species+position+generation
- [x] Worker `setDisasterSettings` protocol — main and worker disaster pacing stay aligned
- [x] Soak HUD — tick, FPS, heap, orgs/agents/species/variants, succession %, disasters, worker/main, dis-sync
- [x] Disaster development messages — cooldown active, safe mode refugia
- [x] Variant hardening — tighter speciation thresholds; failed variants stay quiet
- [x] QA — `qa:determinism` (5000-tick fingerprint gate)

## v0.6 Communication + Memory + Social Behavior (next)

- [ ] Proto-communication signals between agents
- [ ] Short-term memory / trail following (deterministic)
- [ ] Simple flock/pack/herd grouping
- [ ] Culture / technology / civilization remain deferred

## v0.6 Society (deferred)

- [ ] Culture transmission (`simulation/culture`)
- [ ] Technology discoveries (`simulation/technology`)
- [ ] Settlements and civilization metrics (`simulation/civilization`)

## v0.7 Persistence + Polish

- [ ] IndexedDB snapshot storage via `idb`
- [ ] Seed export / import
- [ ] Replay from saved snapshots
- [ ] Performance profiling for large worlds

## Out of Scope (for now)

- Multiplayer / server sync
- External AI narration or LLM-driven agents
- 3D rendering
- Hardcoded human endpoint species
- Tools, medicine, computing, spaceflight (until v0.6+ scope review)
