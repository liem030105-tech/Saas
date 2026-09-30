import { InviteRoleSchema, type Role } from '@trello-clone/shared';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

/** Roles an invite may carry: never Owner (I5), from the shared contract. */
export const INVITE_ROLES = InviteRoleSchema.options;
