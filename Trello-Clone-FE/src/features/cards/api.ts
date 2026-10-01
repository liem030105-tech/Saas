import { apiClient } from '@/api/client';

import type { CardSummaryDto, CreateCardInput } from '@trello-clone/shared';

export const cardsApi = {
  /** POST /lists/:listId/cards (≥ MEMBER); without `position` the server appends the card. */
  create: (listId: string, input: CreateCardInput) =>
    apiClient.post<CardSummaryDto>(`/lists/${listId}/cards`, input),
};
