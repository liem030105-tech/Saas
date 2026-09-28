# Architecture Overview

> **Domain:** system-wide architecture, package boundaries, monorepo dependency rules.
> Per-layer details: [frontend](frontend.md) · [backend](backend.md) · [database](database.md) · [realtime](realtime.md) · [security](security.md).

## Diagram

```
┌────────────────────┐   HTTP /api/v1 (REST, JSON)    ┌─────────────────────┐   Prisma   ┌────────────┐
│  Trello-Clone-FE   │ ─────────────────────────────▶ │   Trello-Clone-BE   │ ─────────▶ │ PostgreSQL │
│  React SPA         │ ◀──── WebSocket (Socket.IO) ── │   modular monolith  │            └────────────┘
└─────────┬──────────┘                                └──────────┬──────────┘
          │              import (schemas / types / constants)    │
          └──────────────▶  packages/shared  ◀───────────────────┘
```

- **Modular monolith:** one backend process, split into domain modules (`auth`, `workspaces`, `boards`, …). A module calls another module only through its **exported service**, never through its internal files.
- No microservices. Only reconsider with a concrete reason (e.g. one part must scale independently in a way the monolith cannot).

## Monorepo (pnpm workspace)

`pnpm-workspace.yaml` (created in Phase 0):
```yaml
packages:
  - Trello-Clone-FE
  - Trello-Clone-BE
  - packages/*
```

| Folder | Package name | May depend on |
|--------|--------------|---------------|
| `Trello-Clone-FE` | `@trello-clone/web` | `@trello-clone/shared` |
| `Trello-Clone-BE` | `@trello-clone/api` | `@trello-clone/shared` |
| `packages/shared` | `@trello-clone/shared` | **Nothing** from FE/BE; only `zod` |

**Why the `@trello-clone/` scope** rather than generic names like `web`/`api`: no collision with public npm packages, `pnpm --filter @trello-clone/api …` is self-explanatory, and imports are clearly internal.

### Dependency rules
- FE → shared ✅ · BE → shared ✅ · shared → FE/BE ❌ · FE ↔ BE ❌ (they talk only over HTTP/WebSocket).
- Internal dependencies use `"@trello-clone/shared": "workspace:*"`.
- A dependency used by one package is installed in that package, not at the root. The root holds only shared dev tooling (eslint, prettier, typescript).

### Scripts
| Location | Scripts |
|----------|---------|
| Root | `dev` (FE + BE in parallel), `build`, `lint`, `typecheck`, `test`, `format`, `format:check`, `db:up` (docker compose) |
| FE | `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e` |
| BE | `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`, `db:studio` |
| shared | `lint`, `typecheck`, `test` (no `build`: consumed as TypeScript source, ADR-015) |

Root `dev`, `build`, `lint`, `typecheck`, and `test` fan out with `pnpm -r --if-present <script>`; `format`, `format:check`, and `db:up` run once at the root. Target one package with `pnpm --filter <pkg> <script>`.

## packages/shared

```
packages/shared/
├── src/
│   ├── schemas/      # Zod schemas for API request/response (auth.schema.ts, card.schema.ts, …)
│   ├── types/        # types inferred from schemas (z.infer) + realtime event payload types
│   ├── constants/    # Role, Plan, ActivityType enums, plan limits, error codes, event names
│   ├── utils/        # pure helpers both sides must compute identically (position.ts, ADR-017)
│   └── index.ts      # the only export entry point
└── package.json      # "exports": { ".": "./src/index.ts" }
```

Shared is an **internal package**: it has no build step. Vite (FE), `tsx` and Vitest (BE dev/tests) compile it directly, and the BE production bundle inlines it (ADR-015). It must therefore stay plain TypeScript with `zod` as its only dependency.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| Zod schemas for data crossing the API | Business logic (permission checks, plan limit checks, rebalancing) |
| Types inferred from schemas, realtime payload types | DB access, Prisma types, Express/React code |
| Enums and constants both sides need | Helpers used by only one side |
| Tiny pure functions tied to a schema (e.g. `.refine`) | Secrets, environment config |
| Pure formulas the FE must predict exactly as the BE stores them (position helpers, ADR-017) | Anything with I/O or state |

Rule of thumb: something goes into shared only when **both FE and BE actually import it**. Otherwise it stays in the package that uses it.
