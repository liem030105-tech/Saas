import type { Role } from '@trello-clone/shared';

// Which workspace settings the caller sees, from the permission matrix (docs/api/README.md). UX
// only: the API enforces the same rules (403).

export const canEditWorkspace = (role: Role) => role === 'OWNER' || role === 'ADMIN';

export const canDeleteWorkspace = (role: Role) => role === 'OWNER';
