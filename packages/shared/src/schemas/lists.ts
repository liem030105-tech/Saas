import { z } from 'zod';

import { CuidSchema } from './common';

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
