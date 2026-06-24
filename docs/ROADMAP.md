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

## v0.3.2 Species Highlight + Performance ✅

- [x] `selectedSpeciesId` in Zustand — select / focus / clear
- [x] Species panel clickable rows with summary stats
- [x] Viewport violet highlight for selected species tile occupancy
- [x] Inspector cross-link — click species on tile to select
- [x] Briefing panel selected-species mode
- [x] Precomputed `speciesOccupancy` in life snapshot
- [x] Deep-time batch stepping (5K ticks/chunk), O(1) tile counts
- [x] Deep-time progress UI + runtime in summary
- [x] ~5× faster +10K yr vs v0.3.1 sync benchmark (exact ticks preserved)

## v0.4.2 Real-Time Living Simulation UX + Time Semantics ✅ (current)

- [x] Simulated time display (years, eras, generations) — ticks demoted to debug
- [x] Play-first controls: Normal, Fast Forward, Super Fast, Ultra Fast
- [x] Manual step moved to Advanced/Debug controls only
- [x] Smooth agent tile interpolation in viewport
- [x] Living animation layer (creatures, plants, biomes, selection glow)
- [x] Latest Developments feed from real state/events
- [x] Deep Time: progress bar, current year, elapsed/ETA, cancel, summary
- [x] Auto-play on app load

## v0.4.1 Spore-Inspired Visual Biology + Biome Renderer ✅

- [x] Organic biome renderer — textured terrain per biome type
- [x] Procedural plant/producer glyphs keyed to density and biomass
- [x] Spore-inspired mobile creature glyphs (grazer / predator / scavenger)
- [x] Visual gene mapping from real genome traits
- [x] Zoom-tier rendering detail (far / medium / close)
- [x] Selected species agent glow + tile highlight + producer highlight
- [x] Inspector visual preview with species stats and traits
- [x] Organic (default) / Debug visual mode toggle
- [x] Performance caps — agent draw limits scale with zoom tier

## v0.4 Mobile Agents + Predation + Food Webs ✅

- [x] Mobile agent kinds: SimpleGrazer, SimplePredator, Scavenger
- [x] Mobile genome traits (speed, stamina, hunting, grazing, aggression, fearfulness, …)
- [x] Deterministic movement, goals, and energy costs
- [x] Herbivory — grazers consume producer biomass with overgrazing pressure
- [x] Predation — predators hunt grazers/scavengers with energy transfer
- [x] Food web links, trophic roles, predator/prey species panel integration
- [x] Viewport mobile agent dots (green grazers, red predators, amber scavengers)
- [x] Throttled agent + food-web milestone events
- [x] Deep-time summary includes grazer/predator deltas, predation, starvation counts

## v0.5 Body Plans + Senses + Environmental Selection (next)

- [ ] Richer agent senses and body-plan variation
- [ ] Stronger environmental selection pressure
- [ ] Proto-behavior expansion depending on v0.4 outcomes
- [ ] Culture / technology / civilization remain deferred

## v0.6 Society (deferred)

- [ ] Culture transmission (`simulation/culture`)
- [ ] Technology discoveries (`simulation/technology`)
- [ ] Settlements and civilization metrics (`simulation/civilization`)

## v0.7 Persistence + Polish

- [ ] IndexedDB snapshot storage via `idb`
- [ ] Seed export / import
- [ ] Replay from saved snapshots
- [ ] Performance profiling for large worlds

## Out of Scope (for now)

- Multiplayer / server sync
- External AI narration or LLM-driven agents
- 3D rendering
- Hardcoded human endpoint species
- Tools, medicine, computing, spaceflight (until v0.6+ scope review)
