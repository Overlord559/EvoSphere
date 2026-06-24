# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, mobile agents with predation, circular planet viewport, and Spore-inspired procedural Pixi rendering.

**Current phase:** v0.4.3 Stability + Bigger Circular World + Zoom Inspection

## Status

v0.4.3 engine stability + planet topology:

- **Time-budgeted sim loop** — Normal/Fast/Super Fast/Ultra Fast use per-frame ms budget, not blind 100-tick batches
- **Snapshot throttling** — internal ticks can outpace UI snapshots; briefing/developments update less often in fast modes
- **Circular planet mask** — active world is a round planet inside the grid; outside = space/void
- **Bigger worlds** — Small 96² · Standard 192² · Large 256² · Experimental 384² presets
- **Viewport culling + LOD** — only visible tiles/agents drawn; zoom tiers control glyph detail
- **Zoom / focus inspection** — click tile or agent, Focus species, Inspector/Briefing zoom-to controls
- **Stability guards** — max ticks/ms per frame, event caps, invalid entity quarantine, throttle warnings
- **Performance HUD** — FPS, sim ms/frame, drawn counts, LOD, throttle status (Debug / Advanced)

v0.4.2 living simulation UX:

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
- nanoid (entity/species/event IDs)

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

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
