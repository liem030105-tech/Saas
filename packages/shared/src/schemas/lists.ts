import { z } from 'zod';

import { CuidSchema, PositionSchema } from './common';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const ListTitleSchema = z
  .string({ error: 'Enter a list title' })
  .trim()
  .min(1, 'Enter a list title')
  .max(100, 'Title must be at most 100 characters');

/** POST /boards/:boardId/lists body; without `position` the list is appended at the end. */
export const CreateListInputSchema = z.object({
  title: ListTitleSchema,
  position: PositionSchema.optional(),
});

/** A list as the API returns it (docs/api/lists.md → ListDto). */
export const ListDtoSchema = z.object({
  id: CuidSchema,
  boardId: CuidSchema,
  title: z.string(),
  position: z.number(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** PATCH /lists/:listId body: rename, archive or unarchive, move (at least one field). */
export const UpdateListInputSchema = z
  .object({
    title: ListTitleSchema.optional(),
    archived: z.boolean().optional(),
    position: PositionSchema.optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.archived !== undefined || input.position !== undefined,
    { error: 'Change at least one field' },
  );
