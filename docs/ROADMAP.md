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

## v0.3.2 Species Highlight + Performance ✅ (current)

- [x] `selectedSpeciesId` in Zustand — select / focus / clear
- [x] Species panel clickable rows with summary stats
- [x] Viewport violet highlight for selected species tile occupancy
- [x] Inspector cross-link — click species on tile to select
- [x] Briefing panel selected-species mode
- [x] Precomputed `speciesOccupancy` in life snapshot
- [x] Deep-time batch stepping (5K ticks/chunk), O(1) tile counts
- [x] Deep-time progress UI + runtime in summary
- [x] ~5× faster +10K yr vs v0.3.1 sync benchmark (exact ticks preserved)

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
