import type {
  CommentDtoSchema,
  CommentInputSchema,
  CommentsPageSchema,
  ListCommentsQuerySchema,
} from '../schemas/comments';
import type { z } from 'zod';

export type CommentDto = z.infer<typeof CommentDtoSchema>;
export type CommentInput = z.input<typeof CommentInputSchema>;
export type CommentData = z.output<typeof CommentInputSchema>;
export type ListCommentsQuery = z.output<typeof ListCommentsQuerySchema>;
export type CommentsPage = z.infer<typeof CommentsPageSchema>;
