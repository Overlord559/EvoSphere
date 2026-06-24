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

## v0.3.1 Runtime + Observability ✅ (current)

- [x] Run / pause / step controls (1, 10, 100, 1,000 ticks)
- [x] Speed modes: 1×, 10×, 100×, 1,000×
- [x] Deep time fast-forward (+1K / +10K / +100K / +1M years)
- [x] Simulated time abstraction (tick, generation estimate, years)
- [x] Deep time summary events (population, biomass, species, colonization deltas)
- [x] World briefing panel with era and live developments
- [x] Species clustering fix (shared founder species, gated speciation)
- [x] Throttled milestone events (no reproduction spam)
- [x] Improved life/biomass overlay visibility + activity highlights

### Intentionally not in v0.3.1

- Animals and predators
- Tools, culture, civilization, spiritual systems
- Medicine, computing, spaceflight
- IndexedDB persistence

## v0.4 Behavior + Ecology expansion (next)

- [ ] Mobile agents with movement and local behavior
- [ ] Predation and food webs
- [ ] Expanded species interactions
- [ ] Richer inspector and species lineage views

## v0.5 Society

- [ ] Culture transmission (`simulation/culture`)
- [ ] Technology discoveries (`simulation/technology`)
- [ ] Settlements and civilization metrics (`simulation/civilization`)

## v0.6 Persistence + Polish

- [ ] IndexedDB snapshot storage via `idb`
- [ ] Seed export / import
- [ ] Replay from saved snapshots
- [ ] Performance profiling for large worlds

## Out of Scope (for now)

- Multiplayer / server sync
- External AI narration or LLM-driven agents
- 3D rendering
- Hardcoded human endpoint species
