import { z } from 'zod';

import { CardSummaryDtoSchema } from './cards';
import { CuidSchema, HexColorSchema } from './common';
import { LabelDtoSchema } from './labels';
import { ListDtoSchema } from './lists';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const BoardTitleSchema = z
  .string({ error: 'Enter a board title' })
  .trim()
  .min(1, 'Enter a board title')
  .max(100, 'Title must be at most 100 characters');

/** POST /workspaces/:workspaceId/boards body; the background defaults to #0079bf. */
export const CreateBoardInputSchema = z.object({
  title: BoardTitleSchema,
  background: HexColorSchema.optional(),
});

/** GET /workspaces/:workspaceId/boards query: `archived=true` lists archived boards only. */
export const ListBoardsQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'], { error: 'Use archived=true or archived=false' })
    .default('false')
    .transform((value) => value === 'true'),
});

/** A board as the API returns it (docs/api/boards.md → BoardDto). */
export const BoardDtoSchema = z.object({
  id: CuidSchema,
  workspaceId: CuidSchema,
  title: z.string(),
  background: HexColorSchema,
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** PATCH /boards/:boardId body: rename, recolour, archive or unarchive (at least one field). */
export const UpdateBoardInputSchema = z
  .object({
    title: BoardTitleSchema.optional(),
    background: HexColorSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.background !== undefined || input.archived !== undefined,
    { error: 'Change at least one field' },
  );

/**
 * GET /boards/:boardId: the board with its non-archived lists (each with its non-archived cards)
 * and its labels, sorted by `position ASC, id ASC`. Lists and cards arrive with LIST-001 and
 * CARD-001; until then the arrays are empty, but the shape is complete.
 */
export const BoardDetailDtoSchema = BoardDtoSchema.extend({
  lists: z.array(ListDtoSchema.extend({ cards: z.array(CardSummaryDtoSchema) })),
  labels: z.array(LabelDtoSchema),
});
