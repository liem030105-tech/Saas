---
name: database
description: Use when changing the Prisma schema, creating migrations, editing seed data, adding indexes, or writing complex/raw queries and repositories in Trello-Clone-BE. Also use when reviewing data-model changes for multi-tenancy or cascade impact.
---

# Skill: Database (Prisma + PostgreSQL)

## Purpose
Evolve the schema safely: every change is migrated, documented, tenant-safe, and indexed for its queries.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/architecture/database.md` – multi-tenancy, authorization at the data layer, migration rules
2. `docs/database/schema.md` and `docs/database/relationships.md` – current models, cascades, invariants, indexes
3. `Trello-Clone-BE/prisma/schema.prisma` (the source of truth once it exists)

## Rules
- Every model change → `pnpm --filter @trello-clone/api exec prisma migrate dev --name <snake_case_description>`. Commit the schema and the migration together.
- Never edit a migration that has been merged. Fix forward with a new migration.
- Destructive changes use expand → migrate data → contract across separate migrations.
- New business models must be reachable from a `Workspace` (directly or through a `Board`) so tenant checks are possible.
- Choose `onDelete` deliberately and document it in relationships.md. Users with history are anonymized, not deleted.
- Add an index for every new foreign key used in a `where` or ordering; justify composite indexes by the query they serve.
- Keep invariants in services (e.g. `Card.boardId === List.boardId`); document new invariants.
- Raw SQL only via `$queryRaw` tagged templates.
- Seed data (`prisma/seed.ts`) must be idempotent and contain no real personal data.
- Never run `prisma migrate reset` or `db push` against anything but a local DB, and ask the user first.

## May modify
- `Trello-Clone-BE/prisma/schema.prisma`, new files in `prisma/migrations/`, `prisma/seed.ts`
- `Trello-Clone-BE/src/modules/*/*.repository.ts`
- `docs/database/*`, `docs/architecture/database.md`
- `packages/shared/src/constants/**` when an enum crosses the API

## Must never modify
- Merged migration files
- `Trello-Clone-FE/**`
- `.env*` / real connection strings

## Done checklist
- [ ] Migration generated and applies cleanly on an empty DB
- [ ] `docs/database/schema.md` (changelog) and `relationships.md` updated
- [ ] Indexes exist for new query paths
- [ ] Tests cover new invariants and cascade behavior
