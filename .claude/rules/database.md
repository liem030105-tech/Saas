---
paths:
  - "Trello-Clone-BE/prisma/**"
  - "Trello-Clone-BE/prisma.config.ts"
  - "**/*.repository.ts"
---

# Database (Prisma + PostgreSQL) rules

Loaded automatically when Claude reads matching files. Procedures, references, and checklists: the `database` skill.

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
