import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAccessToken } from '@/api/token-store';

import { workspacesApi } from './api';

import type { WorkspaceDto } from '@trello-clone/shared';

export const workspaceKeys = {
  all: ['workspaces'] as const,
};

/** The caller's workspaces. Rendered only when signed in; never fetches without a token. */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.all,
    queryFn: workspacesApi.list,
    enabled: getAccessToken() !== null,
  });
}

/** The workspace for a `/w/:slug` URL, resolved from the list (no slug endpoint, docs/api/workspaces.md). */
export function useWorkspaceBySlug(slug: string | undefined) {
  const query = useWorkspaces();
  return { ...query, workspace: query.data?.find((workspace) => workspace.slug === slug) };
}

/**
 * POST /workspaces. The new workspace goes into the cached list right away, so navigating to
 * `/w/<slug>` finds it; the list is then refetched for the server's order.
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: async (created) => {
      queryClient.setQueryData<WorkspaceDto[]>(workspaceKeys.all, (list = []) => [
        ...list,
        created,
      ]);
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}
