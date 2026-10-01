import { apiClient } from '@/api/client';

import type {
  CardDetailDto,
  CardSummaryDto,
  CreateCardInput,
  UpdateCardInput,
} from '@trello-clone/shared';

export const cardsApi = {
  /** POST /lists/:listId/cards (≥ MEMBER); without `position` the server appends the card. */
  create: (listId: string, input: CreateCardInput) =>
    apiClient.post<CardSummaryDto>(`/lists/${listId}/cards`, input),
  /** GET /cards/:cardId (≥ VIEWER): archived cards included. */
  get: (cardId: string) => apiClient.get<CardDetailDto>(`/cards/${cardId}`),
  /** PATCH /cards/:cardId: title, description, due date, completed, archived (≥ MEMBER). */
  update: (cardId: string, input: UpdateCardInput) =>
    apiClient.patch<CardDetailDto>(`/cards/${cardId}`, input),
  /** DELETE /cards/:cardId (≥ MEMBER). */
  remove: (cardId: string) => apiClient.delete<void>(`/cards/${cardId}`),
};
