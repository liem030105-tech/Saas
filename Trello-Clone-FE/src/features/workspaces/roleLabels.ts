import { ROLE_ORDER, type Role } from '@trello-clone/shared';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

/** Roles an invite may carry: never Owner (I5). */
export const INVITE_ROLES = ROLE_ORDER.filter(
  (role): role is Exclude<Role, 'OWNER'> => role !== 'OWNER',
);

/** "Oct 7, 2026" for an ISO date. */
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));
