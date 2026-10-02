import { apiClient } from '@/api/client';

import type {
  ActivityDto,
  BoardDetailDto,
  BoardDto,
  CardSummaryDto,
  CreateBoardInput,
  SearchCardsQuery,
  UpdateBoardInput,
} from '@trello-clone/shared';

export const boardsApi = {
  /** GET /workspaces/:workspaceId/boards: open boards (or archived ones), newest first. */
  list: (workspaceId: string, archived = false) =>
    apiClient.get<BoardDto[]>(`/workspaces/${workspaceId}/boards`, { params: { archived } }),
  /** POST /workspaces/:workspaceId/boards (≥ MEMBER). */
  create: (workspaceId: string, input: CreateBoardInput) =>
    apiClient.post<BoardDto>(`/workspaces/${workspaceId}/boards`, input),
  /** GET /boards/:boardId: the board with its lists, cards and labels (≥ VIEWER). */
  get: (boardId: string) => apiClient.get<BoardDetailDto>(`/boards/${boardId}`),
  /** PATCH /boards/:boardId: rename, recolour, archive or unarchive (≥ MEMBER). */
  update: (boardId: string, input: UpdateBoardInput) =>
    apiClient.patch<BoardDto>(`/boards/${boardId}`, input),
  /** DELETE /boards/:boardId (≥ ADMIN): everything on the board goes with it. */
  remove: (boardId: string) => apiClient.delete<void>(`/boards/${boardId}`),
  /** GET /boards/:boardId/search (≥ VIEWER, SEARCH-001): the open cards matching every filter. */
  search: (boardId: string, query: SearchCardsQuery, signal?: AbortSignal) =>
    apiClient.get<CardSummaryDto[]>(`/boards/${boardId}/search`, { params: query, signal }),
  /** GET /boards/:boardId/activities (≥ VIEWER): newest first; `cardId` keeps one card's entries. */
  activities: (boardId: string, options: { cardId?: string; cursor?: string }) =>
    apiClient.getPage<ActivityDto>(`/boards/${boardId}/activities`, {
      params: {
        ...(options.cardId && { cardId: options.cardId }),
        ...(options.cursor && { cursor: options.cursor }),
      },
    }),
};
