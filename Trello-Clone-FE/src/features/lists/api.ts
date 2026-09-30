import { apiClient } from '@/api/client';

import type { CreateListInput, ListDto } from '@trello-clone/shared';

export const listsApi = {
  /** POST /boards/:boardId/lists (≥ MEMBER); without `position` the server appends the list. */
  create: (boardId: string, input: CreateListInput) =>
    apiClient.post<ListDto>(`/boards/${boardId}/lists`, input),
};
