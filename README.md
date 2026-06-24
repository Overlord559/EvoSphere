# EvoSphere

Physics-constrained biosphere-to-space-age civilization simulator — deterministic world generation, emergent microbial and plant life, mobile agents with predation, and Spore-inspired procedural Pixi viewport rendering.

**Current phase:** v0.4.1 Spore-Inspired Visual Biology + Biome Renderer

## Status

v0.4.1 upgrades the visual layer from debug pixels to observable living forms:

- **Organic biome renderer** — textured terrain per biome (ocean waves, forest canopies, grass strokes, desert dunes, swamp reeds, volcanic embers, hydrothermal vents)
- **Procedural plant/producer glyphs** — algae clouds, microbial mats, stems, canopies, reeds, grass clusters keyed to density/biomass
- **Spore-inspired creature glyphs** — grazers, predators, scavengers with body, head, eyes, mouth, tail, legs/fins/antennae
- **Visual genes** — genome traits (speed, stamina, sensory range, hunting/grazing efficiency, aggression, water tolerance) map to silhouette
- **Zoom-level detail** — simplified glyphs when zoomed out, full appendages when zoomed in
- **Organic / Debug toggle** — Organic default; Debug restores flat tiles and colored dots
- **Inspector visual preview** — creature or producer glyph with species stats and visible traits

v0.4 foundation:

- **Mobile agents** — SimpleGrazer, SimplePredator, Scavenger with mobile genomes and trophic roles
- **Movement** — deterministic goals (find food, graze, hunt, flee, migrate, wander, rest, seek mate) with terrain energy costs
- **Herbivory** — grazers consume producer biomass; overgrazing can collapse local patches
- **Predation** — predators hunt mobile prey with efficiency/aggression vs speed/fear resolution
- **Food web** — predator/prey links in species panel; briefing shows dominant grazer/predator and warnings
- **Viewport dots** — green grazers, red predators, amber scavengers on the tile map
- **Events** — throttled agent.spawned, agent.predation, agent.migrated, foodweb.* milestones
- **Deep-time** — grazer/predator deltas, predation count, starvation count in summary

v0.3.2 foundation:

- Species selection + map highlight, deep-time performance (~5× +10K yr speedup)

Tools, culture, civilization, and 3D remain out of scope.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- **Viewport** — organic biomes + procedural creature/plant glyphs (Pixi.js primitives, no external assets)
- Zustand (UI + session state)
- seedrandom (deterministic RNG)
- nanoid (entity/species/event IDs)

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Deep-time performance (approximate, seed `evosphere-prime`, 96×96)

| Jump | Typical runtime |
|------|-----------------|
| +1K yr | ~15–25s |
| +10K yr | ~2–4 min (includes mobile agent ticks) |
| +100K / +1M | minutes — exact tick simulation, UI stays responsive via chunked async stepping |

## Simulation time

- **Tick** — atomic simulation step
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
