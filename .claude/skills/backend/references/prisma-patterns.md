# Prisma 7 patterns

Setup and version details: the `database` skill (`references/prisma-7.md`). Data-layer rules: [architecture/database.md](../../../../docs/architecture/database.md).

## Client
Import the singleton from `src/config/prisma.ts`; never `new PrismaClient()` elsewhere. Types come from the generated client:
```ts
import { prisma } from '../../config/prisma';
import type { Prisma, Role } from '../../generated/prisma/client';
```

## Transactions
Use the interactive form whenever a change writes more than one row or must be atomic with its activity log:
```ts
const card = await prisma.$transaction(async (tx) => {
  const moved = await tx.card.update({ where: { id }, data: { listId, boardId, position } });
  await logActivity(tx, { type: 'CARD_MOVED', boardId, cardId: id, userId, data: { fromListId, toListId: listId } });
  return moved;
});
// emit realtime events here, after commit (REALTIME-001+)
```
Pass `tx` down to helpers; never call the global `prisma` inside a transaction callback.

## Select only what the response needs
Prefer `select` over `include` for API responses, and map to DTOs. Never return `passwordHash`, `tokenHash`, or other internal columns.

## Errors
- `findUniqueOrThrow` / `update` on a missing row throws `P2025`: the error handler maps it to `404 NOT_FOUND`. Prefer explicit `findFirst` + `AppError.notFound()` when authorization is involved, so 404 comes from the same path for "missing" and "not a member".
- Unique violations throw `P2002`: map to `409 CONFLICT` in the service where the conflict is expected (email, slug, membership).

## Pagination (cursor)
```ts
const items = await prisma.activity.findMany({
  where: { boardId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});
const hasMore = items.length > limit;
if (hasMore) items.pop();                          // drop the probe row; it starts the next page
const nextCursor = hasMore ? items[items.length - 1]!.id : null; // id of the last returned item
```

## Avoid N+1
Never query inside a loop over rows; use `include`/`select` for relations or one `findMany({ where: { id: { in: ids } } })`.
