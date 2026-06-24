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

## v0.4.1 Spore-Inspired Visual Biology + Biome Renderer ✅ (current)

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
