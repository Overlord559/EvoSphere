# Project OS Index — EvoSphere

**Router for agents.** Read `AGENTS.md` and this file before serious work.

---

## Repo purpose

EvoSphere — deterministic world simulation from microbial life through civilization layers; Pixi 2D default viewport; optional Three.js 3D experimental; Rust/WASM numeric kernels with TS fallback.

---

## Read-first routing

| Priority | Path |
|----------|------|
| 1 | `C:\dev\operator-brain\BRAIN_INDEX.md` |
| 2 | `C:\dev\operator-brain\current-state.md` |
| 3 | `C:\dev\stone-industries-os\00_SYSTEM\CANONICAL_SOURCE_OF_TRUTH.md` |
| 4 | [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) |
| 5 | `C:\dev\operator-brain\projects\evosphere.md` |

---

## Task-specific docs

| Doc | Purpose |
|-----|---------|
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | Product brief |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System architecture |
| [`ROADMAP.md`](ROADMAP.md) | Version roadmap |
| [`RUST_WASM_PLAN.md`](RUST_WASM_PLAN.md) | WASM kernel plan |
| [`VISUAL_DIRECTION_2_5D.md`](VISUAL_DIRECTION_2_5D.md) | Visual direction |
| [`../README.md`](../README.md) | Setup, status, QA index |

---

## Validation commands

```bash
cd C:\dev\evosphere
npm install
npm run build
npm run lint
npm run qa:simulation-invariants   # core invariant gate
npm run qa:stability               # stability regression
```

See `package.json` for full `qa:*` suite (27+ scripts).

---

## Final report expectations

Return: files changed · validation (`build`/`lint`/relevant `qa:*`) · Operator Brain files loaded · safe to commit · next action.

No app logic change unless explicitly scoped. No commit/push/stage without approval.
