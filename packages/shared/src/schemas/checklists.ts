import { z } from 'zod';

import { CuidSchema, PositionSchema } from './common';

// docs/api/cards.md → Checklists (CARD-005). Field rules: docs/api/README.md → Validation rules.
// Messages are shown in the UI (English).

export const ChecklistTitleSchema = z
  .string({ error: 'Enter a checklist title' })
  .trim()
  .min(1, 'Enter a checklist title')
  .max(100, 'Title must be at most 100 characters');

export const ChecklistItemContentSchema = z
  .string({ error: 'Enter an item' })
  .trim()
  .min(1, 'Enter an item')
  .max(500, 'An item must be at most 500 characters');

/** docs/api/cards.md → ChecklistItemDto. */
export const ChecklistItemDtoSchema = z.object({
  id: CuidSchema,
  content: z.string(),
  done: z.boolean(),
  position: z.number(),
});

/** docs/api/cards.md → ChecklistDto: its items in `position, id` order. */
export const ChecklistDtoSchema = z.object({
  id: CuidSchema,
  title: z.string(),
  position: z.number(),
  items: z.array(ChecklistItemDtoSchema),
});

/** POST /cards/:cardId/checklists body; the checklist is appended. */
export const CreateChecklistInputSchema = z.object({ title: ChecklistTitleSchema });

/** PATCH /checklists/:checklistId body: rename or move (at least one field). */
export const UpdateChecklistInputSchema = z
  .object({ title: ChecklistTitleSchema.optional(), position: PositionSchema.optional() })
  .refine((input) => input.title !== undefined || input.position !== undefined, {
    error: 'Change at least one field',
  });

/** POST /checklists/:checklistId/items body; the item is appended. */
export const CreateChecklistItemInputSchema = z.object({ content: ChecklistItemContentSchema });

/** PATCH /checklists/:checklistId/items/:itemId body (at least one field). */
export const UpdateChecklistItemInputSchema = z
  .object({
    content: ChecklistItemContentSchema.optional(),
    done: z.boolean().optional(),
    position: PositionSchema.optional(),
  })
  .refine(
    (input) =>
      input.content !== undefined || input.done !== undefined || input.position !== undefined,
    { error: 'Change at least one field' },
  );
