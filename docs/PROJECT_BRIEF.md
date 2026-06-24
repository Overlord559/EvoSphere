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

## v0.5 Body Plans + Senses + Environmental Selection ✅ (current)

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
