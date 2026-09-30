import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { getAccessToken } from '@/api/token-store';

import { workspacesApi } from './api';

import type { UpdateWorkspaceInput, WorkspaceDto } from '@trello-clone/shared';

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

/**
 * The workspace for a `/w/:slug` URL, resolved from the list (no slug endpoint,
 * docs/api/workspaces.md). A page keeps following the workspace it showed when its slug changes
 * under the same URL (changed on the settings page or in another tab): `workspace.slug` then
 * differs from `slug`, and the page redirects to the new URL. `gone` means the workspace it showed
 * no longer exists for the caller (deleted, or access lost): the page redirects to `/`.
 */
export function useWorkspaceBySlug(slug: string | undefined) {
  const query = useWorkspaces();
  const [shown, setShown] = useState<{ slug: string | undefined; id: string } | null>(null);
  const followed = shown && shown.slug === slug ? shown.id : undefined;
  const workspace =
    query.data?.find((item) => item.slug === slug) ??
    (followed ? query.data?.find((item) => item.id === followed) : undefined);

  // Remember what this URL shows (React's "adjust state while rendering" pattern).
  if (workspace && workspace.slug === slug && (shown?.slug !== slug || shown.id !== workspace.id)) {
    setShown({ slug, id: workspace.id });
  }

  return { ...query, workspace, gone: Boolean(query.data && !workspace && followed) };
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

/**
 * PATCH /workspaces/:workspaceId. The cached list gets the new name and slug right away, so
 * navigating to the new `/w/<slug>` finds it; the list is then refetched.
 */
export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) => workspacesApi.update(workspaceId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData<WorkspaceDto[]>(workspaceKeys.all, (list = []) =>
        list.map((workspace) => (workspace.id === updated.id ? updated : workspace)),
      );
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

/** DELETE /workspaces/:workspaceId. The workspace leaves the cached list before the refetch. */
export function useDeleteWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => workspacesApi.remove(workspaceId),
    onSuccess: async () => {
      queryClient.setQueryData<WorkspaceDto[]>(workspaceKeys.all, (list = []) =>
        list.filter((workspace) => workspace.id !== workspaceId),
      );
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}
