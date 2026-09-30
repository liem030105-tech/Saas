import { apiClient } from '@/api/client';

import type {
  ChangeMemberRoleInput,
  CreateWorkspaceInput,
  MemberDto,
  UpdateWorkspaceInput,
  WorkspaceDto,
} from '@trello-clone/shared';

export const workspacesApi = {
  /** GET /workspaces: only the caller's workspaces, ordered by name, with the caller's role. */
  list: () => apiClient.get<WorkspaceDto[]>('/workspaces'),
  /** POST /workspaces: the caller becomes OWNER; the server generates the slug. */
  create: (input: CreateWorkspaceInput) => apiClient.post<WorkspaceDto>('/workspaces', input),
  /** PATCH /workspaces/:workspaceId (≥ ADMIN): name and/or slug; 409 when the slug is taken. */
  update: (workspaceId: string, input: UpdateWorkspaceInput) =>
    apiClient.patch<WorkspaceDto>(`/workspaces/${workspaceId}`, input),
  /** DELETE /workspaces/:workspaceId (OWNER): everything in it is deleted. */
  remove: (workspaceId: string) => apiClient.delete<void>(`/workspaces/${workspaceId}`),
  /** GET /workspaces/:workspaceId/members: by role (OWNER first), then name. */
  listMembers: (workspaceId: string) =>
    apiClient.get<MemberDto[]>(`/workspaces/${workspaceId}/members`),
  /** PATCH …/members/:userId (≥ ADMIN; footnotes 1–3 of the permission matrix). */
  changeMemberRole: (workspaceId: string, userId: string, input: ChangeMemberRoleInput) =>
    apiClient.patch<MemberDto>(`/workspaces/${workspaceId}/members/${userId}`, input),
  /** DELETE …/members/:userId: remove a member (≥ ADMIN), or leave when `userId` is the caller. */
  removeMember: (workspaceId: string, userId: string) =>
    apiClient.delete<void>(`/workspaces/${workspaceId}/members/${userId}`),
};
