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
The always-on rules live in [`.claude/rules/database.md`](../../rules/database.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

## References
Read the one that matches the work before writing code; they show the target shape. If the real code differs, the code wins: update the reference in the same PR.
- [`references/prisma-7.md`](references/prisma-7.md): schema generator, `prisma.config.ts`, driver adapter, commands

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
