import { useWorkspaces } from '../queries';

import type { Role } from '@trello-clone/shared';

/**
 * The caller's role in a workspace, from the cached workspace list (undefined while it loads or
 * for a workspace they are not in). For UI visibility with `can()` only; the API re-checks.
 */
export function useWorkspaceRole(workspaceId: string | undefined): Role | undefined {
  const { data } = useWorkspaces();
  return data?.find((workspace) => workspace.id === workspaceId)?.role;
}
