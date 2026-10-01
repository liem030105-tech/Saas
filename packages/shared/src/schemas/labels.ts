import { z } from 'zod';

import { CuidSchema, HexColorSchema } from './common';

/** A board label (docs/api/boards.md → LabelDto); labels arrive with CARD-005. */
export const LabelDtoSchema = z.object({
  id: CuidSchema,
  boardId: CuidSchema,
  name: z.string(),
  color: HexColorSchema,
});
