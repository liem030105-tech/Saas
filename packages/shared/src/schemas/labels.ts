import { z } from 'zod';

import { CuidSchema, HexColorSchema } from './common';

// docs/api/boards.md → Labels (CARD-005). Field rules: docs/api/README.md → Validation rules.

/** A board label (docs/api/boards.md → LabelDto). */
export const LabelDtoSchema = z.object({
  id: CuidSchema,
  boardId: CuidSchema,
  name: z.string(),
  color: HexColorSchema,
});

/** A label's name: trimmed, may be empty (a colour-only label), at most 50 characters. */
export const LabelNameSchema = z
  .string({ error: 'Enter a label name' })
  .trim()
  .max(50, 'Name must be at most 50 characters');

/** POST /boards/:boardId/labels body; without `name` the label is colour-only. */
export const CreateLabelInputSchema = z.object({
  name: LabelNameSchema.default(''),
  color: HexColorSchema,
});

/** PATCH /labels/:labelId body (at least one field). */
export const UpdateLabelInputSchema = z
  .object({
    name: LabelNameSchema.optional(),
    color: HexColorSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    error: 'Change at least one field',
  });
