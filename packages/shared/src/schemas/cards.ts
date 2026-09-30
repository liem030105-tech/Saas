import { z } from 'zod';

import { CuidSchema } from './common';

/**
 * A card as it appears on a board (docs/api/boards.md → CardSummaryDto). Fields owned by CARD-005
 * (labels, members, checklist, comments, cover) are empty or zero until that task lands.
 */
export const CardSummaryDtoSchema = z.object({
  id: CuidSchema,
  listId: CuidSchema,
  title: z.string(),
  position: z.number(),
  dueDate: z.iso.datetime().nullable(),
  completed: z.boolean(),
  coverUrl: z.url().nullable(),
  labelIds: z.array(CuidSchema),
  memberIds: z.array(CuidSchema),
  checklist: z.object({ done: z.number().int(), total: z.number().int() }),
  commentCount: z.number().int(),
});
