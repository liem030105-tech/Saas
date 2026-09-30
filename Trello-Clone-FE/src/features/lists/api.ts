import { apiClient } from '@/api/client';

import type { CreateListInput, ListDto, UpdateListInput } from '@trello-clone/shared';

export const listsApi = {
  /** POST /boards/:boardId/lists (≥ MEMBER); without `position` the server appends the list. */
  create: (boardId: string, input: CreateListInput) =>
    apiClient.post<ListDto>(`/boards/${boardId}/lists`, input),
  /** PATCH /lists/:listId: rename, archive or unarchive (≥ MEMBER). */
  update: (listId: string, input: UpdateListInput) =>
    apiClient.patch<ListDto>(`/lists/${listId}`, input),
  /** DELETE /lists/:listId (≥ MEMBER): its cards go with it. */
  remove: (listId: string) => apiClient.delete<void>(`/lists/${listId}`),
};
