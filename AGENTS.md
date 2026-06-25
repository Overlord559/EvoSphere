# AGENTS.md — EvoSphere

**Audience:** Cursor, Claude, Codex, and other agents working in this repository.

**Project:** EvoSphere — physics-constrained biosphere-to-civilization simulator (Pixi 2D + experimental Three.js 3D).

---

## Source of truth (this repo)

1. **`src/`** — runtime behavior wins
2. **Repo-local Project OS** — `AGENTS.md`, `docs/PROJECT_OS_INDEX.md`, `docs/PROJECT_CONTEXT.md`
3. **Operator Brain** — active execution cockpit (`C:\dev\operator-brain`)
4. **Stone Industries OS / Stone Command Library** — master prompts/rules (`C:\dev\stone-industries-os`)
5. **SaaS Factory** — reusable patterns (`C:\dev\priv-saas-factory`) when relevant

---

# Stone Industries Routing

This repo uses the Stone Industries execution hierarchy:

1. Operator Brain = active execution cockpit and current-state memory.
2. Stone Industries OS / Stone Command Library = company-wide prompt/rules/playbook library.
3. Repo-local Project OS = project-specific working memory.
4. SaaS Factory = reusable build/design/prompt factory when relevant.

Read first for serious work:

`C:\dev\operator-brain\BRAIN_INDEX.md`  
`C:\dev\operator-brain\current-state.md`

Company command library:

`C:\dev\stone-industries-os\00_SYSTEM\CANONICAL_SOURCE_OF_TRUTH.md`

Do not copy the full Master Project OS into this repo.

If context conflicts, report:

```text
Context Conflict Detected
```

If prompt scope is too broad/risky, report:

```text
Prompt Risk Detected
```

No git commit/push/stage/reset/clean without explicit approval.

---

## Operating rules

- Deterministic simulation — preserve reproducibility in QA scripts
- WASM kernels optional — TS fallback must always work
- No production deploy without operator approval
- Brain doc: `C:\dev\operator-brain\projects\evosphere.md`

---

## Validation after code changes

```bash
npm install
npm run build
npm run lint
```

Run relevant `npm run qa:*` scripts for simulation changes (see `docs/PROJECT_OS_INDEX.md`).
