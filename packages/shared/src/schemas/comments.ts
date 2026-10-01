import { z } from 'zod';

import { UserSummarySchema } from './cards';
import { CuidSchema, PaginationQuerySchema } from './common';

// docs/api/cards.md → Comments (CARD-005d). Field rules: docs/api/README.md → Validation rules.

/** A comment's raw markdown: trimmed, 1–5 000 characters. */
export const CommentContentSchema = z
  .string({ error: 'Write a comment' })
  .trim()
  .min(1, 'Write a comment')
  .max(5000, 'A comment must be at most 5000 characters');

/** POST /cards/:cardId/comments and PATCH /comments/:commentId body. */
export const CommentInputSchema = z.object({ content: CommentContentSchema });

/** GET /cards/:cardId/comments query: newest first, `cursor` is the last comment's id. */
export const ListCommentsQuerySchema = PaginationQuerySchema;

/** docs/api/cards.md → CommentDto. */
export const CommentDtoSchema = z.object({
  id: CuidSchema,
  cardId: CuidSchema,
  content: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  author: UserSummarySchema,
});

/** GET /cards/:cardId/comments answer: a page, and the cursor of the next (null at the end). */
export const CommentsPageSchema = z.object({
  data: z.array(CommentDtoSchema),
  nextCursor: CuidSchema.nullable(),
});
