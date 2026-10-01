import type { CardSummaryDtoSchema, CreateCardInputSchema } from '../schemas/cards';
import type { z } from 'zod';

export type CardSummaryDto = z.infer<typeof CardSummaryDtoSchema>;
/** What the add-card composer holds (before trimming). */
export type CreateCardInput = z.input<typeof CreateCardInputSchema>;
export type CreateCardData = z.output<typeof CreateCardInputSchema>;
