# Authorization patterns

Spec: [api/README.md → Authorization model](../../../../docs/api/README.md#authorization-model) (roles, permission matrix, tenant isolation). This file shows how to implement it; it does not restate the rules.

## Role order
```ts
// src/lib/roles.ts – Role comes from the generated Prisma client (same values as the shared enum)
const RANK = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 } as const;
export const hasRole = (actual: Role, min: Role) => RANK[actual] >= RANK[min];
```

## Workspace-scoped resources
```ts
// workspaces.service.ts – exported for other modules (they call the service, never the repository)
export async function assertWorkspaceAccess(userId: string, workspaceId: string, min: Role) {
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  if (!member) throw AppError.notFound();                     // missing workspace OR not a member: same 404
  if (!hasRole(member.role, min)) throw AppError.forbidden(); // member with too low a role: 403
  return member.role;
}
```

## Board-scoped resources: load and authorize in one query
Resolve the workspace from the **stored** resource, never from a client-supplied `workspaceId`.
```ts
// boards.repository.ts
export function findBoardWithRole(userId: string, boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });
}

// boards.service.ts
export async function assertBoardAccess(userId: string, boardId: string, min: Role) {
  const board = await boardsRepository.findBoardWithRole(userId, boardId);
  const role = board?.workspace.members[0]?.role;
  if (!board || !role) throw AppError.notFound();
  if (!hasRole(role, min)) throw AppError.forbidden();
  return { board, role };
}
```
Card, list, comment, and checklist endpoints first resolve `boardId` from the stored row (`Card.boardId` exists for this), then call `assertBoardAccess`.

## Client-supplied foreign keys
Every id in the body must belong to the same board or workspace as the target:
```ts
const list = await tx.list.findFirst({ where: { id: input.listId, boardId: card.boardId }, select: { id: true } });
if (!list) throw AppError.notFound(); // another board's list looks like "does not exist"
```
Cross-workspace moves use `422 BUSINESS_RULE_VIOLATION` only where the API spec says so (e.g. `CROSS_WORKSPACE_MOVE`).

## Ownership rules ("own" in the matrix)
Check after the role check: `if (comment.authorId !== userId && !hasRole(role, 'ADMIN')) throw AppError.forbidden();`

## Tests
Every endpoint gets the non-member (404) and insufficient-role (403) cases, and is registered in the role-matrix and tenant-isolation suites.
