import type { CreateListInputSchema, ListDtoSchema, UpdateListInputSchema } from '../schemas/lists';
import type { z } from 'zod';

export type ListDto = z.infer<typeof ListDtoSchema>;
/** What the add-list composer holds (before trimming). */
export type CreateListInput = z.input<typeof CreateListInputSchema>;
export type CreateListData = z.output<typeof CreateListInputSchema>;
export type UpdateListInput = z.input<typeof UpdateListInputSchema>;
export type UpdateListData = z.output<typeof UpdateListInputSchema>;
