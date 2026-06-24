# EvoSphere

Browser-native evolution simulator — deterministic world generation, agent life cycles, genetics, ecology, culture, and civilization systems rendered in real time.

**Current phase:** v0.1 foundation

## Status

This repository contains the project scaffold: TypeScript types, folder structure, command-center UI shell, and placeholder simulation engine. Live simulation starts in v0.2.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Pixi.js (viewport rendering — v0.2)
- Zustand (state)
- seedrandom (deterministic RNG)
- nanoid, idb (planned for entities and persistence)

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Documentation

- [Project Brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Principles

- No backend — runs entirely in the browser
- Deterministic simulation from seed
- No external AI dependencies
- 2D viewport (Pixi.js), not 3D
