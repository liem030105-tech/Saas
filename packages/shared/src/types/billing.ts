import type { BillingDtoSchema, BillingRedirectDtoSchema } from '../schemas/billing';
import type { z } from 'zod';

export type BillingDto = z.infer<typeof BillingDtoSchema>;
export type BillingRedirectDto = z.infer<typeof BillingRedirectDtoSchema>;
