import type { Role, User, Workspace, WorkspaceMember } from '../../generated/prisma/client';
import type { MemberDto, WorkspaceDto } from '@trello-clone/shared';

/** `role` is the caller's role in this workspace (docs/api/workspaces.md → WorkspaceDto). */
export function toWorkspaceDto(workspace: Workspace, role: Role): WorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    createdAt: workspace.createdAt.toISOString(),
    role,
  };
}

type MemberWithUser = WorkspaceMember & { user: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'> };

/** docs/api/workspaces.md → MemberDto: only public user fields. */
export function toMemberDto(member: MemberWithUser): MemberDto {
  return {
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
    },
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}
