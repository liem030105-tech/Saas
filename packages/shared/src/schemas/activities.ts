import { z } from 'zod';

import { UserSummarySchema } from './cards';
import { CuidSchema, PaginationQuerySchema } from './common';
import { ACTIVITY_TYPES } from '../constants/activity';

// docs/api/boards.md → GET /boards/:boardId/activities (CARD-005e).

/** GET /boards/:boardId/activities query: newest first; `cardId` keeps one card's entries. */
export const ListActivitiesQuerySchema = PaginationQuerySchema.extend({
  cardId: CuidSchema.optional(),
});

/**
 * docs/api/boards.md → ActivityDto. `data` holds the event's details as logged; its shape depends
 * on `type` (see where each type is logged), so clients read the fields they know and ignore others.
 */
export const ActivityDtoSchema = z.object({
  id: CuidSchema,
  type: z.enum(ACTIVITY_TYPES),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  cardId: CuidSchema.nullable(),
  user: UserSummarySchema,
});

/** GET /boards/:boardId/activities answer: a page, and the cursor of the next (null at the end). */
export const ActivitiesPageSchema = z.object({
  data: z.array(ActivityDtoSchema),
  nextCursor: CuidSchema.nullable(),
});
