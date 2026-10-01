import type {
  CardDetailDtoSchema,
  CardSummaryDtoSchema,
  CreateCardInputSchema,
  UpdateCardInputSchema,
  UserSummarySchema,
} from '../schemas/cards';
import type { z } from 'zod';

export type CardSummaryDto = z.infer<typeof CardSummaryDtoSchema>;
/** What the add-card composer holds (before trimming). */
export type CreateCardInput = z.input<typeof CreateCardInputSchema>;
export type CreateCardData = z.output<typeof CreateCardInputSchema>;
export type UpdateCardInput = z.input<typeof UpdateCardInputSchema>;
export type UpdateCardData = z.output<typeof UpdateCardInputSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export type CardDetailDto = z.infer<typeof CardDetailDtoSchema>;
