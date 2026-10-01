import { apiClient } from '@/api/client';

import type { CommentDto, CommentInput } from '@trello-clone/shared';

/** A card's comments (docs/api/cards.md → Comments). */
export const commentsApi = {
  /** GET /cards/:cardId/comments (≥ VIEWER): newest first, a page after `cursor`. */
  list: (cardId: string, cursor?: string) =>
    apiClient.getPage<CommentDto>(`/cards/${cardId}/comments`, {
      params: cursor ? { cursor } : undefined,
    }),
  /** POST /cards/:cardId/comments (≥ MEMBER). */
  create: (cardId: string, input: CommentInput) =>
    apiClient.post<CommentDto>(`/cards/${cardId}/comments`, input),
  /** PATCH /comments/:commentId (its author, ≥ MEMBER). */
  update: (commentId: string, input: CommentInput) =>
    apiClient.patch<CommentDto>(`/comments/${commentId}`, input),
  /** DELETE /comments/:commentId (its author ≥ MEMBER, or ≥ ADMIN). */
  remove: (commentId: string) => apiClient.delete<void>(`/comments/${commentId}`),
};
