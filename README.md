# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, mobile agents with predation, circular planet viewport, and Spore-inspired procedural Pixi rendering.

**Current phase:** v0.5.4c Population Cap Architecture + Adaptive Carrying Capacity

## Status

v0.5.4c population architecture (2026-06-24):

- **Aggregate vs tracked population** — producers and mobile agents continue growing in aggregate pools when tracked individual budget is full; ecology drives limits, not legacy 5000/800 globals
- **Adaptive carrying capacity** — `ecology/carryingCapacity.ts` computes per-tile and world capacity from habitat, succession, biomass, stress, and trophic role
- **Population config** — world-size-scaled `maxTrackedIndividuals`, `maxTrackedAgents`, `maxRenderedAgents`, safety ceilings
- **Bottleneck taxonomy** — distinguishes artificial cap pressure, ecological bottleneck, carrying-capacity plateau, expansion failure
- **Cap-pressure events** — `population.capacity_pressure`, `population.expansion_wave`, `evolution.competition_pressure`, `evolution.niche_expansion`
- **UI** — Briefing population architecture block; Soak HUD shows tracked+aggregate, capacity %, repr-cap flag
- **QA** — `npm run qa:population` verifies no legacy cap stall, bounded tracked entities, aggregate growth
- **Blocked until soak passes:** v0.6 Communication + Social Learning

v0.5.4b hardening pass (2026-06-24):

- **Deterministic IDs** — monotonic `deterministicId.ts` replaces `nanoid` in sim-critical paths; reset replay exact match
- **Worker disaster settings sync** — `setDisasterSettings` message; UI changes apply in worker mode
- **Soak HUD expanded** — tick, FPS, heap, orgs/agents/species/variants, succession %, disasters, worker/main path, dis-sync
- **Disaster pacing messages** — cooldown active, safe mode refugia, developments feed
- **Variant hardening** — tighter speciation thresholds; sorted registry iteration for tie-breaks
- **QA** — `npm run qa:determinism` added; evolution QA requires exact reset replay

v0.5.4 proto-cognition + ecological succession + adaptive radiation (2026-06-24):

- **Abiotic vs biotic split** — worldgen spawns barren/fertile/basin substrates; forests/grasslands/swamps emerge via succession only
- **Ecological succession** — `ecology/succession.ts` transforms tiles from producer biomass, water, stability, disturbance
- **Disaster pacing + safe mode** — rare/normal/harsh/chaos/manual; refugia preserved; mass extinctions very rare by default
- **Bottleneck recovery + adaptive radiation** — stagnation detection, recovery modifiers, local-fitness speciation
- **Variant → subspecies → species** — establishment grace, failed variants quiet, survival-biased branching
- **Proto-cognition** — tiny inheritable neural controllers, agent memory, species memory, reinforcement on meaningful events
- **UI** — Briefing succession/recovery/cognition; Species stable vs variants; Inspector cognition card; disaster frequency controls
- **QA** — `npm run qa:succession` · `npm run qa:evolution` added

v0.5.3 deep-time pacing + camera/selection + world variety + cataclysms (2026-06-24):

- **Cursor-centered zoom** — wheel/trackpad zoom anchors on cursor via `zoomAtScreenPoint()`; no northwest drift
- **Selection guards** — species/tile click no longer mutates sim state or auto-traps camera; extinct species cleared safely
- **Deep-time pacing** — era-based Auto Pace (fast abiogenesis → slower scaffold for later eras); higher fast-mode tick budgets
- **Random origin profiles** — deterministic founder sites vary by seed (vents, coasts, swamp mats, tundra, volcanic, basins)
- **Biome variety** — snow, marsh, mountain ridges, improved swamp/tundra visuals
- **Natural disaster system** — drought, flood, wildfire, eruption, ice pulse, tsunami, asteroid, disease, etc. with real tile/life effects
- **Disaster controls** — inject/random + severity + Briefing active disasters + stress overlay
- **Latest Developments** — disaster/evolution/colonization summaries from real deltas
- **QA** — `npm run qa:worldgen` added; stability + performance gates pass

v0.5.2b long-run soak + focus escape (2026-06-24):

- **Soak Debug HUD** — runtime yr, heap trend, snapshot backlog, Pixi gfx/container counts, cache sizes, RAF/worker counts, crash risk + warnings
- **Focus escape UX** — Exit Focus, Zoom Out, Reset Camera, Stop Following, Fit Planet, ESC key; camera mode label; manual pan/wheel disables follow unless locked
- **Secondary crash fix** — follow mode no longer spams `cameraFocusRequest` every snapshot (soft `followPanTarget` pan instead); species pop history capped; render cache bounded + destroyed on reset/HMR
- **Lifecycle guards** — singleton RAF/worker instance counters surfaced in HUD
- **QA** — `npm run qa:longrun` (yr 25 table every 5 yr) + browser manual soak checklist in docs

v0.5.2 crash forensics + stability (2026-06-23):

- **Root cause fixed** — Pixi `Graphics` objects were recreated every animation frame without `destroy()` on layer clear → GPU/memory leak crashed tab ~year 4 at normal speed
- **Persistent render surfaces** — one reusable `Graphics` per layer; terrain cached between snapshots; animated layers only on RAF
- **Worker snapshot backpressure** — max 2 pending snapshots, latest-wins drop, worker-side snapshots/sec cap, `snapshotConsumed` ack
- **Safety caps** — `MAX_BIRTHS_PER_TICK` (64), stability guards every 5 ticks, lightweight population counts
- **Crash health HUD** — heap est., snapshot bytes, pending snapshots, Pixi gfx count, cap usage %, crash risk level
- **QA** — `npm run qa:crash-repro` (year 10 runaway gate) + existing stability/performance scripts

v0.5.1 workerized performance architecture:

- **Web Worker simulation** — `SimEngine` runs off main thread; React/Pixi stay responsive at Super Fast / Ultra Fast
- **Compact snapshots** — typed-array tile density + agent render buffers; transferable `ArrayBuffer` where feasible
- **Feature flag** — `WORKER_SIMULATION_ENABLED` in `src/simulation/config/simConfig.ts` with main-thread fallback
- **Performance profiler** — subsystem timings (life, agents, snapshot, briefing, render) + debug table in Advanced controls
- **Render decoupling** — terrain layer cached by `worldId`; agents/overlays redraw on snapshot version; animation at display FPS
- **Agent SoA (Phase A)** — structure-of-arrays mirror for hot fields; full tick migration planned Phase B
- **QA benchmarks** — `npm run qa:performance` + existing `npm run qa:stability`

v0.5 body plans + senses + environmental selection:

- **Time-budgeted sim loop** — Normal/Fast/Super Fast/Ultra Fast use per-frame ms budget, not blind 100-tick batches
- **Snapshot throttling** — internal ticks can outpace UI snapshots; briefing/developments update less often in fast modes
- **Circular planet mask** — active world is a round planet inside the grid; outside = space/void
- **Bigger worlds** — Small 96² · Standard 192² · Large 256² · Experimental 384² presets
- **Viewport culling + LOD** — only visible tiles/agents drawn; zoom tiers control glyph detail
- **Zoom / focus inspection** — click tile or agent, Focus species, Inspector/Briefing zoom-to controls
- **Stability guards** — max ticks/ms per frame, event caps, invalid entity quarantine, throttle warnings
- **Performance HUD** — FPS, sim ms/frame, drawn counts, LOD, throttle status (Debug / Advanced)

v0.5 body plans + senses + environmental selection:

- **Body plan model** — symmetry, locomotion, limbs, mouth, armor, sensors, habitat adaptations (deterministic from genome)
- **Sensory profiles** — vision, smell, vibration, heat, water/pressure — affect hunting, grazing, flee, migration
- **Environmental fitness** — temperature, moisture, terrain, biomass, predator pressure, crowding affect survival and reproduction
- **Species selection metrics** — body plan summary, senses, dominant habitat, fitness, selection pressures in Species/Briefing panels
- **Visual integration** — glyphs reflect body plan (fins, tentacles, jaws, armor shell, antennae)
- **Stability QA gate** — `npm run qa:stability` · `npm run qa:performance`

v0.4.3 engine stability + planet topology:

- Simulated time UI, Play-first controls, smooth agent interpolation, developments feed, Deep Time progress/cancel

v0.4.1 visual layer: organic biomes, procedural plant/creature glyphs, visual genes, Organic/Debug toggle

v0.4 foundation: mobile agents, herbivory, predation, food webs, deep-time summaries

Tools, culture, civilization, and 3D remain out of scope.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- **Viewport** — culling + LOD + circular planet (Pixi.js primitives)
- Zustand (UI + session state + time-budgeted runtime loop)
- seedrandom (deterministic RNG)
- deterministic monotonic IDs in sim paths (`src/utils/deterministicId.ts`); nanoid retained only where non-sim UI needs it

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run qa:stability
npm run qa:performance
npm run qa:crash-repro
npm run qa:longrun
npm run qa:worldgen
npm run qa:succession
npm run qa:evolution
npm run qa:determinism
npm run qa:population
```

## Manual browser QA (v0.5.4c)

**Population:** Algae/bio population should exceed ~5,000 aggregate when habitat supports it; tracked organisms stay bounded; Soak HUD shows `orgs tracked+aggregate` and `cap %`. If growth stops, Briefing should explain ecological vs representation cap.

**Soak:** `npm run dev` → Standard 192×192, worker on, organic on → Normal 10 min → Fast 10 min → Super Fast 5 min → Ultra Fast 2 min → Deep Time +1K (cancel once) → inject one moderate wildfire/drought → inspect cognition card → clear/focus species → zoom/pan → reset same seed. Watch Soak HUD: tick/yr/FPS, heap trend flat, bio pop can grow past legacy caps, pending snap ≤2, worker=1, RAF=1, succession % climbing, repr-cap when tracked budget full.

**Determinism:** After reset with same seed, population/species counts should match prior run (headless gate: `npm run qa:determinism`).

**Focus escape:** Focus species/tile → zoom in → manual zoom out → Exit Focus → Stop Following → Reset Camera → ESC → Fit Planet. Sim keeps running unless Pause while inspecting is on.

## Deep-time performance (approximate, seed `evosphere-prime`, Standard 192×192)

| Jump | Typical runtime |
|------|-----------------|
| +1K yr | ~20–40s |
| +10K yr | ~3–6 min |
| +100K / +1M | minutes — exact tick simulation, chunked async stepping |

## Simulation time

- **Tick** — atomic simulation step (internal; Debug mode only in UI)
- **Generation estimate** — ~25 ticks per generation
- **Simulated years** — 10 ticks ≈ 1 year

## Documentation

- [Project Brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Principles

- No backend — runs entirely in the browser
- Deterministic simulation from seed — no `Math.random()`
- No external AI dependencies
- Energy drives life — movement, grazing, and predation all cost energy
- 2D viewport (Pixi.js), not 3D
