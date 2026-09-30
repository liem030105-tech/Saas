import { ROLE_ORDER, type Role } from '@trello-clone/shared';

// Which workspace settings the caller sees, from the permission matrix (docs/api/README.md). UX
// only: the API enforces the same rules (403).

export const canEditWorkspace = (role: Role) => role === 'OWNER' || role === 'ADMIN';

export const canDeleteWorkspace = (role: Role) => role === 'OWNER';

/** Footnote 3: an ADMIN manages only members whose role is ≤ ADMIN; an OWNER manages anyone. */
export const canManageMember = (actor: Role, target: Role) =>
  actor === 'OWNER' || (actor === 'ADMIN' && target !== 'OWNER');

/** Footnote 2: only an OWNER grants OWNER. */
export const assignableRoles = (actor: Role): readonly Role[] =>
  actor === 'OWNER' ? ROLE_ORDER : ROLE_ORDER.filter((role) => role !== 'OWNER');

/** Invitations: create, list, revoke (≥ ADMIN). */
export const canInvite = canEditWorkspace;
