import { hasRole } from '../../lib/roles';

import type { Role } from '../../generated/prisma/client';

/**
 * The authoritative permission map (WORKSPACE-005): each action of the permission matrix
 * (docs/api/README.md) → the lowest role allowed to do it. Every workspace-scoped route
 * (requireWorkspaceRole) and service check reads it; the FE keeps a UX-only copy. Footnotes that
 * depend on more than the caller's role (LAST_OWNER, "own" resources, a target's role) stay in
 * the services, on top of this map.
 */
export const WORKSPACE_PERMISSIONS = {
  'workspace.view': 'VIEWER',
  'workspace.update': 'ADMIN',
  'workspace.delete': 'OWNER',
  'workspace.leave': 'VIEWER',
  'members.list': 'VIEWER',
  'members.changeRole': 'ADMIN',
  'members.remove': 'ADMIN',
  /** Footnote 3: acting on a member whose current role is OWNER. */
  'members.manageOwners': 'OWNER',
  /** Footnote 2: granting OWNER. */
  'members.grantOwner': 'OWNER',
  /** Invitations: create, list, revoke (the invite role is also capped at the caller's). */
  'invites.manage': 'ADMIN',
  'board.view': 'VIEWER',
  /** Create, rename, recolour, archive/unarchive. */
  'board.edit': 'MEMBER',
  'board.delete': 'ADMIN',
  'label.manage': 'MEMBER',
  'list.manage': 'MEMBER',
  'card.view': 'VIEWER',
  /** Create, edit, move, archive, delete. */
  'card.edit': 'MEMBER',
  /** Assign members, attach labels, checklists. */
  'card.assign': 'MEMBER',
  'comment.view': 'VIEWER',
  'comment.create': 'MEMBER',
  'comment.editOwn': 'MEMBER',
  'comment.deleteOwn': 'MEMBER',
  'comment.deleteAny': 'ADMIN',
  'attachment.upload': 'MEMBER',
  'attachment.deleteOwn': 'MEMBER',
  'attachment.deleteAny': 'ADMIN',
  'billing.view': 'ADMIN',
  'billing.manage': 'OWNER',
} as const satisfies Record<string, Role>;

export type WorkspaceAction = keyof typeof WORKSPACE_PERMISSIONS;

/** Whether `role` may perform `action` (role only; see the footnotes above). */
export const hasPermission = (role: Role, action: WorkspaceAction) =>
  hasRole(role, WORKSPACE_PERMISSIONS[action]);
