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

## v0.1 Foundation (current)

Delivered in this phase:

- Vite + React + TypeScript scaffold
- Shared simulation types (`TerrainType`, `Tile`, `World`, etc.)
- Folder structure for all major systems
- Deterministic RNG utility (`seedrandom`)
- `SimEngine` placeholder
- Dark command-center landing shell with panel navigation
- Documentation (this file, architecture, roadmap)

Not in v0.1:

- World generation
- Pixi viewport rendering
- Agent ticks
- Persistence

## v0.2 World + Viewport ✅ (current)

Delivered in this phase:

- Deterministic procedural world from seed
- Pixi.js tile viewport with six overlay modes
- SimEngine owns world, tick, and event log
- World/Events/Inspector panels show real data
- Tile click selection

## Success Criteria for v0.3

- Microbial/plant energy loop on real tile fertility
- First agent entities with genetics
- Species panel shows live counts (not placeholders)
