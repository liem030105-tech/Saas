import type { BillingDtoSchema } from '../schemas/billing';
import type { z } from 'zod';

export type BillingDto = z.infer<typeof BillingDtoSchema>;
