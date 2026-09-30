import { prisma } from '../../config/prisma';

// Membership queries (backend.md → Repository): reused by every workspace-scoped check.

/** The caller's role in the workspace, or null when the workspace does not exist or they are not a member. */
export async function findMemberRole(userId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

/** Only the caller's own workspaces (unordered; the service sorts them). */
export function listMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    select: { role: true, workspace: true },
  });
}

/** The public user fields a member row carries (MemberDto.user). */
export const memberUserSelect = {
  select: { id: true, name: true, email: true, avatarUrl: true },
} as const;

/** Every member of the workspace with their public user fields (unordered; the service sorts). */
export function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: memberUserSelect },
  });
}
