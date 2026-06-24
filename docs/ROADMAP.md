# EvoSphere — Roadmap

## v0.1 Foundation ✅

- [x] Vite + React + TypeScript scaffold
- [x] Dependencies: pixi.js, zustand, seedrandom, nanoid, idb, tailwindcss
- [x] Shared simulation types
- [x] Folder structure for all major systems
- [x] Deterministic RNG utility
- [x] SimEngine placeholder
- [x] Command-center UI shell
- [x] Project documentation

## v0.2 World + Viewport ✅ (current)

- [x] Procedural world generator from seed (`simulation/world`)
- [x] Tile grid with terrain types and climate attributes
- [x] Pixi.js viewport — pan/zoom tile map with overlays
- [x] SimEngine tick loop with world state
- [x] Event log (world generated, reset, periodic ticks)
- [x] Wire viewport and panels to simulation snapshots
- [x] Tile selection and inspector panel

### Intentionally not in v0.2

- Agents, microbes, plants, animals
- Species registry or population counts
- Society, culture, technology
- IndexedDB persistence
- Climate simulation over time (ticks advance counter only)

## v0.3 Life (next)

- [ ] Microbial energy loop on fertile/wet tiles
- [ ] Plant colonization of suitable biomes
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
