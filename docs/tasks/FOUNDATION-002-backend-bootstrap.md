# FOUNDATION-002: Backend bootstrap

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Status | Todo |
| Depends on | FOUNDATION-001 |
| Blocked by decisions | none |
| Skills | backend |

# Goal
A runnable Express + TypeScript API skeleton (`@trello-clone/api`) with config, logging, error handling, and a health endpoint.

# Context
Structure per [architecture/backend.md](../architecture/backend.md); error format per [api/README.md](../api/README.md#canonical-error-format); HTTP hardening per [security.md](../architecture/security.md#http-hardening).

# Requirements
1. Package `Trello-Clone-BE` named `@trello-clone/api` with scripts `dev` (watch), `build`, `start`, `lint`, `typecheck`, `test`.
2. `src/config/env.ts`: Zod-validated env (`NODE_ENV`, `PORT`, `CLIENT_URL`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, TTLs). The process exits with a clear message if anything is invalid. `.env.example` lists every variable with empty values.
3. `src/config/logger.ts`: Pino with `redact` for `password`, `token`, `authorization`, `cookie`, `set-cookie`.
4. `src/app.ts` builds the app (no `listen`); `src/server.ts` listens. Middleware order: request id → Pino HTTP logger → Helmet → CORS (allowlist `CLIENT_URL`, credentials) → `express.json({ limit: '1mb' })` → cookie parser → routes under `/api/v1` → 404 handler → `errorHandler`.
5. `src/lib/app-error.ts` (`AppError(code, status, message, details?)`) and `src/middlewares/error-handler.ts`, producing the canonical error format including `requestId`. Zod errors map to 400 with `details[]`.
6. `src/middlewares/validate.ts` (Zod for `body` / `params` / `query`, strips unknown fields).
7. `src/middlewares/rate-limit.ts` with the limits from D-04 (not yet applied to any route).
8. `GET /api/v1/health` → `200 { data: { status: "ok" } }` (Public).

# Out of Scope
Database access (FOUNDATION-004), the shared package (FOUNDATION-005), authentication (AUTH-*).

# Frontend Changes
None.

# Backend Changes
`Trello-Clone-BE/` package: `src/config/*`, `src/lib/app-error.ts`, `src/middlewares/{request-id,error-handler,not-found,validate,rate-limit}.ts`, `src/app.ts`, `src/server.ts`, `src/modules/health/*`.

# Database Changes
None.

# API Changes
`GET /api/v1/health`.

# Realtime Changes
None.

# Security Considerations
No stack traces in responses. CORS never `*`. `.env` is git-ignored; only `.env.example` is committed.

# Testing
- Integration (Supertest): `/health` → 200; an unknown route → 404 in the canonical format with `requestId`; a test-only route using `validate` → 400 with `details`.
- Unit: `env.ts` rejects a missing `JWT_ACCESS_SECRET`.

# Acceptance Criteria
- [ ] `pnpm --filter @trello-clone/api dev` serves `/api/v1/health`.
- [ ] Every error response matches the canonical format and carries `X-Request-Id`.
- [ ] Tests pass.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
FOUNDATION-001 (workspace and tooling).

# Risks
Middleware order bugs (e.g. errors thrown before the request id is set) → covered by the 404 test asserting `requestId`.
