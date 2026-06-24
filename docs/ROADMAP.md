# EvoSphere — Roadmap

## v0.1 Foundation ✅ (current)

- [x] Vite + React + TypeScript scaffold
- [x] Dependencies: pixi.js, zustand, seedrandom, nanoid, idb, tailwindcss
- [x] Shared simulation types
- [x] Folder structure for all major systems
- [x] Deterministic RNG utility
- [x] SimEngine placeholder
- [x] Command-center UI shell
- [x] Project documentation

## v0.2 World + Viewport

- [ ] Procedural world generator from seed (`simulation/world`)
- [ ] Tile grid with terrain types and climate attributes
- [ ] Pixi.js viewport — pan/zoom tile map
- [ ] SimEngine tick loop with world state
- [ ] Basic event log (world generated, tick advanced)
- [ ] Wire viewport to simulation snapshots

## v0.3 Life

- [ ] Agent entities with position and species id
- [ ] Genetics: traits, inheritance, mutation (`simulation/genetics`)
- [ ] Behavior: movement, feeding, reproduction (`simulation/behavior`)
- [ ] Ecology: carrying capacity, predation (`simulation/ecology`)
- [ ] Species panel shows live population data
- [ ] Inspector panel for selected agent

## v0.4 Society

- [ ] Culture transmission (`simulation/culture`)
- [ ] Technology discoveries (`simulation/technology`)
- [ ] Settlements and civilization metrics (`simulation/civilization`)
- [ ] Events panel streams cultural and tech milestones

## v0.5 Persistence + Polish

- [ ] IndexedDB snapshot storage via `idb`
- [ ] Seed export / import
- [ ] Replay from saved snapshots
- [ ] Performance profiling for large worlds
- [ ] Mobile-safe viewport controls

## Out of Scope (for now)

- Multiplayer / server sync
- External AI narration or LLM-driven agents
- 3D rendering
- Mobile app wrappers
