import type {
  AttachmentDtoSchema,
  CardDetailDtoSchema,
  CardSummaryDtoSchema,
  CreateCardInputSchema,
  MoveCardInputSchema,
  MoveCardResultSchema,
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
export type AttachmentDto = z.infer<typeof AttachmentDtoSchema>;
export type MoveCardInput = z.input<typeof MoveCardInputSchema>;
export type MoveCardData = z.output<typeof MoveCardInputSchema>;
export type MoveCardResult = z.infer<typeof MoveCardResultSchema>;
