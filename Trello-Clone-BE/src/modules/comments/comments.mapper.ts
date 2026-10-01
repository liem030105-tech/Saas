import type { Comment } from '../../generated/prisma/client';
import type { CommentDto, UserSummary } from '@trello-clone/shared';

/** docs/api/cards.md → CommentDto. */
export function toCommentDto(comment: Comment & { author: UserSummary }): CommentDto {
  return {
    id: comment.id,
    cardId: comment.cardId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: comment.author,
  };
}
