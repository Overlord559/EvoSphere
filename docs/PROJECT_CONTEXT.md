# PROJECT_CONTEXT — EvoSphere

## Purpose

Physics-constrained biosphere-to-space-age civilization simulator — emergent life, era pacing, civilization layer, optional WASM kernels, 2D Pixi + experimental 3D viewport.

## Current State

- Branch: `main` @ verify with `git rev-parse --short HEAD`
- Phase: v0.6.x — Rust/WASM kernel spike, 3D experimental, civilization/sapient cinematic tuning
- **Known risk: large uncommitted WIP** — many modified/untracked simulation, WASM, and viewport files
- Operator Brain may cite older SHA — check `current-state.md` vs local HEAD

## Canonical Context

Operator Brain:

`C:\dev\operator-brain\BRAIN_INDEX.md`  
`C:\dev\operator-brain\current-state.md`

Stone Industries OS / Stone Command Library:

`C:\dev\stone-industries-os\00_SYSTEM\CANONICAL_SOURCE_OF_TRUTH.md`

Brain project doc:

`C:\dev\operator-brain\projects\evosphere.md`

## Active Risks

- Dirty WIP may exist
- Do not commit or stage without operator approval
- Do not edit app logic unless scoped
- Stability regression QA required before major sim changes (Standard 192×192 + soak scripts)

## Next Recommended Action

Run `npm run build && npm run lint && npm run qa:simulation-invariants` on current tree; update Operator Brain EvoSphere entry after next verified milestone push.
