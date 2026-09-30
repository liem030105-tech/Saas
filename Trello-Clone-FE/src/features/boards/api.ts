import { apiClient } from '@/api/client';

import type { BoardDto, CreateBoardInput } from '@trello-clone/shared';

export const boardsApi = {
  /** GET /workspaces/:workspaceId/boards: open boards (or archived ones), newest first. */
  list: (workspaceId: string, archived = false) =>
    apiClient.get<BoardDto[]>(`/workspaces/${workspaceId}/boards`, { params: { archived } }),
  /** POST /workspaces/:workspaceId/boards (≥ MEMBER). */
  create: (workspaceId: string, input: CreateBoardInput) =>
    apiClient.post<BoardDto>(`/workspaces/${workspaceId}/boards`, input),
};
