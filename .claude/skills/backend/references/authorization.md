# Authorization patterns

Spec: [api/README.md → Authorization model](../../../../docs/api/README.md#authorization-model) (roles, permission matrix, tenant isolation). This file shows how to implement it; it does not restate the rules.

## Role order
`ROLE_ORDER` comes from `@trello-clone/shared` (same values as the Prisma `Role` enum); the comparison is BE-only, in `src/lib/roles.ts`:
```ts
export const hasRole = (actual: Role, min: Role) => ROLE_ORDER.indexOf(actual) <= ROLE_ORDER.indexOf(min);
```

## Permission map (WORKSPACE-005)
`src/modules/workspaces/permissions.ts` maps every action of the permission matrix to its lowest role (`WORKSPACE_PERMISSIONS`); routes and services check actions, never raw roles: `requireWorkspaceRole('board.edit')`, `hasPermission(role, 'members.grantOwner')`. A new matrix row means a new action there, in the FE copy (`Trello-Clone-FE/src/features/workspaces/permissions.ts`, UI visibility only), and in the fixture `packages/shared/tests/data/permission-matrix.json`; both maps' unit tests fail until all three agree. Footnotes that need more than the caller's role (LAST_OWNER, "own", a target's role, the invite-role cap) stay in the services.

## Workspace-scoped resources
```ts
// workspaces.service.ts – exported for other modules (they call the service, never the repository)
export async function assertWorkspaceAccess(userId: string, workspaceId: string, action: WorkspaceAction) {
  const role = await workspacesRepository.findMemberRole(userId, workspaceId);
  if (!role) throw AppError.notFound();                        // missing workspace OR not a member: same 404
  if (!hasPermission(role, action)) throw AppError.forbidden(); // member with too low a role: 403
  return role;
}
```

`requireWorkspaceRole(action)` (`src/middlewares/require-workspace-role.ts`, after `authenticate` and `validate` on `/workspaces/:workspaceId/*` routes) calls `assertWorkspaceAccess(currentUserId(req), workspaceId, action)`, answers a malformed id with the same 404, and stores the role in `res.locals.workspaceRole`; services called from other modules use `assertWorkspaceAccess` directly.

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
export async function assertBoardAccess(userId: string, boardId: string, action: WorkspaceAction) {
  const board = await boardsRepository.findBoardWithRole(userId, boardId);
  const role = board?.workspace.members[0]?.role;
  if (!board || !role) throw AppError.notFound();
  if (!hasPermission(role, action)) throw AppError.forbidden();
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
Check after the role check: `if (comment.authorId !== userId && !hasPermission(role, 'comment.deleteAny')) throw AppError.forbidden();`

## Tests
Every endpoint gets the non-member (404) and insufficient-role (403) cases, and is registered in the role-matrix harness (`describeRoleMatrix` from `tests/helpers/role-matrix.ts`, in `tests/integration/role-matrix.test.ts` or the module's own file) and the tenant-isolation suite.
