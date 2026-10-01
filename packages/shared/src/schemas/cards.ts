import { z } from 'zod';

import { CuidSchema, PositionSchema } from './common';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const CardTitleSchema = z
  .string({ error: 'Enter a card title' })
  .trim()
  .min(1, 'Enter a card title')
  .max(200, 'Title must be at most 200 characters');

/** POST /lists/:listId/cards body; without `position` the card is appended at the end. */
export const CreateCardInputSchema = z.object({
  title: CardTitleSchema,
  position: PositionSchema.optional(),
});

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
