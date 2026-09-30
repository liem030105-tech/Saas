import { apiClient } from '@/api/client';

import type { CreateWorkspaceInput, WorkspaceDto } from '@trello-clone/shared';

export const workspacesApi = {
  /** GET /workspaces: only the caller's workspaces, ordered by name, with the caller's role. */
  list: () => apiClient.get<WorkspaceDto[]>('/workspaces'),
  /** POST /workspaces: the caller becomes OWNER; the server generates the slug. */
  create: (input: CreateWorkspaceInput) => apiClient.post<WorkspaceDto>('/workspaces', input),
};
