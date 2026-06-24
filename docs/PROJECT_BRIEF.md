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

## v0.3.1 Runtime + Observability ✅ (current)

Delivered:

- Run/pause simulation loop with speed modes (1×–1000×)
- Step 1 / 10 / 100 / 1,000 ticks
- Deep time fast-forward (+1K / +10K / +100K / +1M years) with summary events
- World briefing panel (era, dominant species, threats, deep-time recap)
- Species clustering fix — shared founder lineages, gated speciation
- Throttled milestone event log (blooms, die-offs, extinctions, colonization)
- Improved life/biomass overlay visibility

## v0.3 Life ✅

Delivered:

- Microbial energy loop and plant colonization on real tile data
- Genome inheritance with deterministic mutation
- Live species/biomass counts in UI
- Life/biomass viewport overlays

## Success Criteria for v0.4

- Mobile agents with behavior and predation
- Food web interactions between life kinds
- No civilization or tool systems yet
