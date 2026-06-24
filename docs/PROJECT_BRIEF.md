# EvoSphere — Project Brief

## Vision

EvoSphere is a deterministic evolution simulator that runs entirely in the browser. Players observe and study emergent life — from terrain and climate through genetics, behavior, ecology, culture, technology, and civilization — without server infrastructure or external AI.

## Problem

Evolution and emergence are fascinating but hard to explore interactively. Most tools are either opaque black boxes or require heavy desktop installs. EvoSphere targets a lightweight, transparent, seed-driven sandbox in the web.

## Audience

- Curious builders and students exploring simulation design
- Edward Stone / Operator Brain ecosystem (portfolio-grade demo)
- Future: anyone who wants a readable, mod-friendly evolution toy

## Core Pillars

1. **Determinism** — same seed produces the same world and timeline
2. **Layered emergence** — terrain → life → society, each layer readable
3. **Command-center UX** — inspect world, species, events, and entities without clutter
4. **Browser-first** — no install, no backend, IndexedDB for persistence later
5. **Honest scope** — no fake data, no dead controls, no spectacle without substance

## v0.5.4c Population Cap Architecture + Adaptive Carrying Capacity ✅ (current)

- Aggregate vs tracked population — ecology continues in pools when representation budget full
- Dynamic carrying capacity from habitat, succession, biomass, trophic role
- Bottleneck detector distinguishes artificial cap vs ecological plateau
- Soak HUD + Briefing expose capacity pressure and aggregate counts
- v0.6 Communication blocked until browser soak passes

## v0.5.4b Browser Soak + Determinism + Worker Disaster Sync ✅

Delivered:

- Deterministic monotonic IDs for organisms, agents, species, disasters, events, world (`deterministicId.ts`)
- Reset replay exact match — root cause was `nanoid` IDs leaking into mutation RNG forks and global ID counter drift across engine instances
- Worker disaster settings sync — `setDisasterSettings` worker message + store bridge
- Expanded Soak HUD for browser long-run validation
- Disaster pacing UX messages (cooldown, safe mode refugia)
- Variant speciation threshold tuning + sorted registry iteration
- QA: `npm run qa:determinism`

Next phase: **v0.6 Communication + Social Learning** after manual browser soak sign-off.

## v0.5.4 Proto-Cognition + Ecological Succession + Adaptive Radiation ✅

Delivered:

- Abiotic terrain vs biotic ecosystem split — worldgen barren substrates; life-created biomes via succession
- Ecological succession module — microbial → algal → pioneer → grassland/forest/swamp/marsh
- Disaster pacing + safe mode — rare default, refugia, mass extinction very rare, UI frequency controls
- Bottleneck recovery + adaptive radiation — stagnation detection, recovery modifiers, local-fitness branching
- Variant → subspecies → species pipeline with establishment grace
- Proto-cognition — tiny neural controllers, agent/species memory, inherited learned bias
- QA: `qa:succession`, `qa:evolution`

Next phase: **v0.6 Communication + Social Learning** after browser soak.

## v0.5.3 Deep-Time Pacing + Camera/Selection + Procedural World Variety + Cataclysms ✅

Delivered:

- Cursor-centered zoom fix (`cameraController.zoomAtScreenPoint`)
- Species/tile inspection guardrails — no sim mutation on select; extinct species auto-clear
- Era pacing model + Auto Pace UI (`eraPacing.ts`)
- Fast/Super/Ultra increased tick budgets with graceful throttle
- Randomized origin profiles per seed (`originProfiles.ts`)
- Biome distinctness — snow, marsh, mountain ridges, swamp/tundra visuals
- Natural disaster system (`disasters/`) with inject controls and Briefing panel
- Latest Developments reports disaster/evolution changes
- `npm run qa:worldgen` — biome/origin determinism gate

Next phase: choose based on stability — **v0.6 Communication + Memory** or continued soak validation.

## v0.5.2b Long-Run Browser Soak + Focus Escape UX ✅

Delivered:

- Soak Debug HUD with heap trend, snapshot/worker metrics, Pixi/cache counts, crash risk warnings
- Focus escape controls + camera mode display; ESC exits focus/follow
- Secondary crash fix: follow mode no longer traps camera via per-snapshot focus requests
- Bounded render caches + species pop history; lifecycle guards for RAF/worker
- `npm run qa:longrun` + manual browser soak checklist
- Rust/WASM: **defer** until browser leak fully verified in manual soak

## v0.5.2 Crash Forensics + Runaway Fix ✅

Delivered:

- Pixi render leak fixed (persistent Graphics, animated vs full redraw)
- Worker snapshot backpressure + crash health HUD
- `npm run qa:crash-repro` year-10 gate
- Rust/WASM: **defer** — fix TS + SoA Phase B first; WASM spike only if lifeTick still dominates after stable browser QA

## v0.5.1 Workerized Performance Architecture ✅

Delivered:

- Web Worker owns `SimEngine` — main thread renders React/Pixi only
- Compact typed-array snapshots — render / inspector / full modes
- Performance profiler + debug table (life, agents, snapshot, briefing, render)
- Worker speed schedules — Super Fast / Ultra Fast no longer lock the UI thread
- Main-thread fallback when worker unavailable (`WORKER_SIMULATION_ENABLED`)
- Agent SoA Phase A + documented Phase B/C/D escalation (Rust/WASM deferred)
- QA: `npm run qa:stability` · `npm run qa:performance`

## v0.5 Body Plans + Senses + Environmental Selection ✅

Delivered:

- Body plan model on mobile agents — symmetry, locomotion, mouth, armor, sensors, habitat adaptations
- Body plan genetics — genome-derived with slow mutation; passed to offspring
- Sensory profiles — vision, smell, vibration, heat, water/pressure; affect hunt/graze/flee/migrate
- Environmental fitness — terrain/climate/biomass/predation/crowding affect survival and reproduction
- Species selection metrics in Species + Briefing panels (real state, no fake narrative)
- Visual glyphs reflect body-plan traits (fins, tentacles, jaws, shell, antennae)
- Headless QA gate: `npx tsx scripts/qa-stability.ts`

## v0.4.3 Stability + Bigger Circular World + Zoom Inspection ✅

Delivered:

- Time-budgeted runtime scheduler (ms budget + max ticks/frame, graceful throttle)
- Snapshot throttling — `renderSnapshotVersion`, `lastSnapshotTick`, lighter fast-mode snapshots
- Circular planet mask — `activeMask`, void tiles outside radius, edge climate falloff
- World size presets — 96 / 192 / 256 / 384 (Standard default 192×192)
- Viewport culling + LOD — visible-tile rendering, agent/plant draw caps
- Zoom/focus inspection — tile/agent click, species Focus, Inspector/Briefing zoom-to
- Stability guards — quarantine invalid entities, population warnings, event caps
- Performance HUD in Debug/Advanced controls

## v0.4.2 Real-Time Living Simulation UX + Time Semantics ✅

Delivered:

- Simulated time semantics (years, eras, generations) — ticks internal only
- Play-first runtime with Normal / Fast / Super Fast / Ultra Fast speed modes
- Smooth agent interpolation between tile positions
- Visual animation layer (breathing, wiggle, biome shimmer, activity pulse)
- Latest Developments feed in Briefing panel
- Deep Time progress, ETA, cancel, and summary UX
- Auto-play on load; Debug mode exposes internal tick stepping

## v0.4.1 Spore-Inspired Visual Biology + Biome Renderer ✅

Delivered:

- Organic biome textures for all terrain types with overlay mode preservation
- Procedural producer glyphs (algae, mats, stems, canopies, reeds, grass, vent mats)
- Spore-inspired mobile creature silhouettes (grazer / predator / scavenger)
- Visual gene mapping from real genome traits
- Zoom-tier detail (far / medium / close)
- Selected species glow + tile highlight + inspector preview
- Organic (default) / Debug visual mode toggle

## v0.4 Mobile Agents + Predation + Food Webs ✅

Delivered:

- SimpleGrazer, SimplePredator, Scavenger mobile agents with extended mobile genomes
- Deterministic movement, herbivory, predation, reproduction, starvation, migration
- Food web links and trophic roles in species registry + UI
- Viewport agent dots and throttled food-web milestone events
- Deep-time summaries include grazer/predator deltas and predation/starvation counts

## Success Criteria for v0.5

- Richer body plans, senses, and environmental selection
- No culture, tools, or civilization yet
