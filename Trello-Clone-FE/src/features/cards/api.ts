import { apiClient } from '@/api/client';

import type {
  AttachmentDto,
  CardDetailDto,
  ChecklistDto,
  ChecklistItemDto,
  CreateChecklistInput,
  CreateChecklistItemInput,
  UpdateChecklistInput,
  UpdateChecklistItemInput,
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
  /** PATCH /cards/:cardId: title, description, due date, completed, archived, cover (≥ MEMBER). */
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

/** The members on a card (≥ MEMBER to change; only members of the card's workspace). */
export const cardMembersApi = {
  /** POST /cards/:cardId/members/:userId (idempotent). */
  assign: (cardId: string, userId: string) =>
    apiClient.post<void>(`/cards/${cardId}/members/${userId}`),
  /** DELETE /cards/:cardId/members/:userId (idempotent). */
  unassign: (cardId: string, userId: string) =>
    apiClient.delete<void>(`/cards/${cardId}/members/${userId}`),
};

/** A card's checklists and their items (docs/api/cards.md → Checklists; ≥ MEMBER to change). */
export const checklistsApi = {
  create: (cardId: string, input: CreateChecklistInput) =>
    apiClient.post<ChecklistDto>(`/cards/${cardId}/checklists`, input),
  update: (checklistId: string, input: UpdateChecklistInput) =>
    apiClient.patch<ChecklistDto>(`/checklists/${checklistId}`, input),
  remove: (checklistId: string) => apiClient.delete<void>(`/checklists/${checklistId}`),
  addItem: (checklistId: string, input: CreateChecklistItemInput) =>
    apiClient.post<ChecklistItemDto>(`/checklists/${checklistId}/items`, input),
  updateItem: (checklistId: string, itemId: string, input: UpdateChecklistItemInput) =>
    apiClient.patch<ChecklistItemDto>(`/checklists/${checklistId}/items/${itemId}`, input),
  removeItem: (checklistId: string, itemId: string) =>
    apiClient.delete<void>(`/checklists/${checklistId}/items/${itemId}`),
};

/** A card's files (docs/api/cards.md → Attachments): upload ≥ MEMBER; delete own, or any ≥ ADMIN. */
export const attachmentsApi = {
  /** POST /cards/:cardId/attachments (multipart, field `file`); `onProgress` gets 0–1. */
  upload: (cardId: string, file: File, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<AttachmentDto>(`/cards/${cardId}/attachments`, form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total);
      },
    });
  },
  remove: (attachmentId: string) => apiClient.delete<void>(`/attachments/${attachmentId}`),
};
