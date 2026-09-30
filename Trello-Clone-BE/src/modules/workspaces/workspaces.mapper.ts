import type { Role, Workspace } from '../../generated/prisma/client';
import type { WorkspaceDto } from '@trello-clone/shared';

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
