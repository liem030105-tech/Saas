import { z } from 'zod';

import { PlanSchema } from './workspaces';
import { SUBSCRIPTION_STATUSES } from '../constants/plans';

// docs/api/billing.md (BILLING-001).

export const SubscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/** GET /workspaces/:workspaceId/billing. */
export const BillingDtoSchema = z.object({
  plan: PlanSchema,
  /** Null until the workspace has subscribed once. */
  status: SubscriptionStatusSchema.nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  /** What the plan limits count: boards (archived included), members plus pending invites. */
  usage: z.object({ boards: z.number().int().min(0), members: z.number().int().min(0) }),
});
