import { apiClient } from '@/api/client';

import type {
  CardDetailDto,
  CardSummaryDto,
  CreateCardInput,
  CreateLabelInput,
  LabelDto,
  MoveCardInput,
  MoveCardResult,
  UpdateCardInput,
  UpdateLabelInput,
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
  /** PATCH /cards/:cardId/move: to a list (maybe its own) at a position (≥ MEMBER). */
  move: (cardId: string, input: MoveCardInput) =>
    apiClient.patch<MoveCardResult>(`/cards/${cardId}/move`, input),
  /** DELETE /cards/:cardId (≥ MEMBER). */
  remove: (cardId: string) => apiClient.delete<void>(`/cards/${cardId}`),
};

/** Board labels (docs/api/boards.md → Labels) and the labels on a card (≥ MEMBER to change). */
export const labelsApi = {
  create: (boardId: string, input: CreateLabelInput) =>
    apiClient.post<LabelDto>(`/boards/${boardId}/labels`, input),
  update: (labelId: string, input: UpdateLabelInput) =>
    apiClient.patch<LabelDto>(`/labels/${labelId}`, input),
  remove: (labelId: string) => apiClient.delete<void>(`/labels/${labelId}`),
  /** POST /cards/:cardId/labels/:labelId (idempotent). */
  attach: (cardId: string, labelId: string) =>
    apiClient.post<void>(`/cards/${cardId}/labels/${labelId}`),
  /** DELETE /cards/:cardId/labels/:labelId (idempotent). */
  detach: (cardId: string, labelId: string) =>
    apiClient.delete<void>(`/cards/${cardId}/labels/${labelId}`),
};
