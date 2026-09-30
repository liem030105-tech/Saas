import type { CreateListInputSchema, ListDtoSchema } from '../schemas/lists';
import type { z } from 'zod';

export type ListDto = z.infer<typeof ListDtoSchema>;
/** What the add-list composer holds (before trimming). */
export type CreateListInput = z.input<typeof CreateListInputSchema>;
export type CreateListData = z.output<typeof CreateListInputSchema>;
