import { z } from 'zod';

import { CuidSchema } from './common';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const BoardTitleSchema = z
  .string({ error: 'Enter a board title' })
  .trim()
  .min(1, 'Enter a board title')
  .max(100, 'Title must be at most 100 characters');

/** `#rrggbb`: board backgrounds and label colours (the UI offers presets only). */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #0079bf');

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
