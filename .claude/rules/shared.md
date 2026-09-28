---
paths:
  - "packages/shared/**"
---

# Shared package rules

Loaded automatically when Claude reads files in `packages/shared/`. Full rationale: [docs/architecture/overview.md → packages/shared](../../docs/architecture/overview.md#packagesshared).

- Only code that **both** FE and BE import: Zod schemas for data crossing the API, types inferred with `z.infer`, realtime payload types, enums and constants.
- No business logic, Prisma, Express, React, secrets, or environment config. `zod` is the only dependency.
- Internal package consumed as TypeScript source (ADR-015): no build step, plain TypeScript only (no `const enum`, no path aliases); everything is exported from `src/index.ts`.
- Changing a schema changes the API contract: update `docs/api/<module>.md` and run the repo-wide `pnpm typecheck` (FE and BE both consume it).
