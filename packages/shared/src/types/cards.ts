import type { CardSummaryDtoSchema } from '../schemas/cards';
import type { z } from 'zod';

export type CardSummaryDto = z.infer<typeof CardSummaryDtoSchema>;
