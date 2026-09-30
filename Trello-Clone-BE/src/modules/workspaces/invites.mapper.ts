import type { User, WorkspaceInvite } from '../../generated/prisma/client';
import type { InviteDto } from '@trello-clone/shared';

type InviteWithInviter = WorkspaceInvite & { invitedBy: Pick<User, 'id' | 'name'> };

/** docs/api/workspaces.md → InviteDto. The token hash never leaves the server. */
export function toInviteDto(invite: InviteWithInviter): InviteDto {
  return {
    id: invite.id,
    email: invite.email,
    // Invites are created with a role ≤ ADMIN only (I5).
    role: invite.role as InviteDto['role'],
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    invitedBy: { id: invite.invitedBy.id, name: invite.invitedBy.name },
  };
}
