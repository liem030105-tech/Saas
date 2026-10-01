# Database Architecture

> **Domain:** data access rules, multi-tenancy, authorization boundaries at the data layer.
> Detailed schema: [database/schema.md](../database/schema.md) · Relations, indexes, positions: [database/relationships.md](../database/relationships.md).

## Multi-tenancy

- **Tenant = Workspace.** Every business record belongs to exactly one workspace, directly (Board) or through a Board (List, Card, Label, Activity, …).
- A user can read/write only data in workspaces where they are a `WorkspaceMember`.
- Shared database, shared schema, filtered by foreign keys. Postgres Row-Level Security is not needed at demo scale; it can be added later as defense in depth.

## Authorization rules at the data layer

1. **Every lookup by id must include a membership condition**, or call `assertBoardAccess(userId, boardId, action)` first (actions: `Trello-Clone-BE/src/modules/workspaces/permissions.ts`). Never `findUnique({ id })` and return the result as-is.
2. Child resources (card, list, comment, …) → resolve `boardId` (Card stores `boardId` directly) → `workspaceId` → role check, in **one query** with joins.
3. Not a member, or the resource does not exist → **404 NOT_FOUND** (do not leak existence). Member without the required role → **403 FORBIDDEN**.
4. Foreign keys supplied by the client (`listId`, `labelId`, `userId` when assigning) must belong to the **same board/workspace** as the target resource. E.g. attaching another board's label to a card is rejected.

## Transactions

- Use `prisma.$transaction` for multi-record changes: moving a card + logging activity, rebalancing positions, accepting an invite.
- Emit realtime events **after** the transaction succeeds.

## Migrations

- Every schema change goes through `prisma migrate dev --name <description>`. Never edit the DB by hand or modify a merged migration.
- Destructive changes (renaming/dropping columns) use two steps: add new column → migrate data → drop old column in a later migration.
- Update `docs/database/schema.md` in the same PR.

## Performance

- Load a board once with lists + cards + labels (selective `include`); card details (comments, checklists) load separately when the modal opens. The tiles' checklist progress is one grouped count per card (`boards.repository.findChecklistProgress`), never the items.
- Activity log uses cursor pagination (`createdAt`, `id`).
- Avoid N+1: never query inside a loop; use `include` / `in`.

## Future scalability

- Soft delete via `archived`; hard delete only for boards/workspaces.
- Read replicas or a Redis cache for large boards can be added when needed. Not now.
