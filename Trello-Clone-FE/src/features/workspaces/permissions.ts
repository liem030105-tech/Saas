import { ROLE_ORDER, type Role } from '@trello-clone/shared';

// UI visibility only (WORKSPACE-005): which actions the caller sees, from the permission matrix
// (docs/api/README.md). The BE map in Trello-Clone-BE/src/modules/workspaces/permissions.ts is
// authoritative and re-checks every request (403); this copy only hides buttons. Both are tested
// against the same matrix fixture, so they cannot drift apart.

/** Each matrix action → the lowest role that sees it. */
export const WORKSPACE_VISIBILITY = {
  'workspace.view': 'VIEWER',
  'workspace.update': 'ADMIN',
  'workspace.delete': 'OWNER',
  'workspace.leave': 'VIEWER',
  'members.list': 'VIEWER',
  'members.changeRole': 'ADMIN',
  'members.remove': 'ADMIN',
  'members.manageOwners': 'OWNER',
  'members.grantOwner': 'OWNER',
  'invites.manage': 'ADMIN',
  'board.view': 'VIEWER',
  'board.edit': 'MEMBER',
  'board.delete': 'ADMIN',
  'label.manage': 'MEMBER',
  'list.manage': 'MEMBER',
  'card.view': 'VIEWER',
  'card.edit': 'MEMBER',
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

export type WorkspaceAction = keyof typeof WORKSPACE_VISIBILITY;

/** Whether the UI shows `action` to a caller with `role` (ROLE_ORDER: OWNER first). */
export const can = (role: Role, action: WorkspaceAction) =>
  ROLE_ORDER.indexOf(role) <= ROLE_ORDER.indexOf(WORKSPACE_VISIBILITY[action]);

/** Footnote 3: role menu and "Remove" on a member row; only an OWNER manages an OWNER. */
export const canManageMember = (actor: Role, target: Role) =>
  can(actor, 'members.changeRole') && (target !== 'OWNER' || can(actor, 'members.manageOwners'));

/** Footnote 2: the roles the caller may assign; Owner only for an OWNER. */
export const assignableRoles = (actor: Role): readonly Role[] =>
  can(actor, 'members.grantOwner') ? ROLE_ORDER : ROLE_ORDER.filter((role) => role !== 'OWNER');
