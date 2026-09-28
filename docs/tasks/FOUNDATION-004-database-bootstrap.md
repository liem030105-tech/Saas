# FOUNDATION-004: Database bootstrap

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Status | Todo |
| Depends on | FOUNDATION-002 |
| Blocked by decisions | none |
| Skills | database, backend |

# Goal
Prisma connected to PostgreSQL with the first migration (`User`) and test-database helpers.

# Context
Schema spec: [database/schema.md](../database/schema.md) (User is 'Introduced in FOUNDATION-004'). Rules: [architecture/database.md](../architecture/database.md).

# Requirements
1. Prisma 7 in `@trello-clone/api` (ADR-015): `prisma/schema.prisma` containing **only** the `User` model exactly as specified, generator `prisma-client` with `output = "../src/generated/prisma"`; `prisma.config.ts` holding the schema path, migrations path, and `DATABASE_URL` (loaded explicitly, e.g. `import 'dotenv/config'`).
2. Migration `init_user`.
3. `src/config/prisma.ts`: a PrismaClient singleton built with the `@prisma/adapter-pg` driver adapter from the validated `DATABASE_URL`; logging goes through Pino.
4. `prisma/seed.ts`: idempotent; creates one demo user (email `demo@example.com`, password from the `SEED_DEMO_PASSWORD` env var, which is required).
5. Scripts: `db:migrate`, `db:seed`, `db:studio`, `db:generate`. `src/generated/` is git-ignored; `typecheck`, `test`, and `build` fail with a clear message if the client has not been generated.
6. `tests/helpers/db.ts`: connects to `DATABASE_URL_TEST`, applies migrations once, and exposes `resetDb()` (`TRUNCATE … CASCADE` on all tables).
7. `/health` reports `db: "ok"` or `"down"`, checked with `SELECT 1`.

# Out of Scope
Any model other than User; auth logic.

# Frontend Changes
None.

# Backend Changes
`prisma.config.ts`, `src/config/prisma.ts`, `prisma/*`, `tests/helpers/db.ts`, health check update.

# Database Changes
Model `User`; migration `init_user`.

# API Changes
`GET /api/v1/health` gains a `db` field.

# Realtime Changes
None.

# Security Considerations
The seed password comes from env, never hard-coded. `DATABASE_URL*` only in `.env`.

# Testing
Integration: `resetDb()` empties the tables; `/health` shows `db: ok` against the test DB.

# Acceptance Criteria
- [ ] `db:migrate` then `db:seed` work on a fresh Postgres, and a second `db:seed` changes nothing.
- [ ] Integration tests run against `postgres-test`.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
FOUNDATION-002 (config and app).

# Risks
Tests pointing at the dev DB → the helper refuses to run unless the DB name ends with `_test`.
