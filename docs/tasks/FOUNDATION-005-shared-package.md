# FOUNDATION-005: Shared package

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Status | Todo |
| Depends on | FOUNDATION-002, FOUNDATION-003 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Create `@trello-clone/shared` and prove that both FE and BE consume it.

# Context
Rules for what may live in shared: [architecture/overview.md → packages/shared](../architecture/overview.md#packagesshared).

# Requirements
1. `packages/shared` with `src/{schemas,types,constants}/` and a single `src/index.ts` export. Built with `tsc` (no new build tool); `zod` is its only dependency.
2. `constants/error-codes.ts`: every code in the [error table](../api/README.md#canonical-error-format).
3. `schemas/common.ts`: `CuidSchema`, `PaginationQuerySchema` (`limit` default/max per D-14, optional `cursor`), `ErrorResponseSchema`.
4. BE `errorHandler` and FE `ApiError` import the error codes from shared (replacing any local copies).
5. ESLint `no-restricted-imports` forbids shared from importing FE/BE and forbids importing `@trello-clone/shared/src/*` internals.

# Out of Scope
Domain schemas (added by the task that introduces each endpoint).

# Frontend Changes
`api/client.ts` uses the shared error codes.

# Backend Changes
`error-handler.ts` uses the shared error codes.

# Database Changes
None.

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
Shared is bundled into the FE: it must never contain secrets or server-only logic.

# Testing
Unit: `PaginationQuerySchema` defaults and max; `ErrorResponseSchema` parses a real BE error response (fixture).

# Acceptance Criteria
- [ ] `pnpm typecheck` passes across all packages with the shared imports.
- [ ] A deliberate import of FE code from shared fails lint.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
FOUNDATION-002 and FOUNDATION-003 (both consumers must exist).

# Risks
Dev-time resolution of the TypeScript source vs. `dist` → use `exports` with a `types` condition and build shared before FE/BE in `pnpm -r build`.
