// Plan limits (BILLING-001, docs/api/billing.md → Plans and limits). Values are the proposed
// defaults of D-10. Only the backend enforces them; the FE reads them for upgrade prompts.

import type { Plan } from './roles';

export interface PlanLimits {
  /** Boards per workspace, archived ones included; null = unlimited. */
  boards: number | null;
  /** Members plus pending invites per workspace; null = unlimited. */
  members: number | null;
  /** Largest attachment. */
  maxFileBytes: number;
  /** How far back the activity feed reaches; null = unlimited (D-12: filtered on read). */
  activityRetentionDays: number | null;
}

export const PLAN_LIMITS = {
  FREE: { boards: 5, members: 5, maxFileBytes: 10 * 1024 * 1024, activityRetentionDays: 7 },
  PRO: {
    boards: null,
    members: null,
    maxFileBytes: 100 * 1024 * 1024,
    activityRetentionDays: null,
  },
} as const satisfies Record<Plan, PlanLimits>;

/** Stripe subscription statuses the app acts on; same values as the Prisma enum. */
export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** What a `402 PLAN_LIMIT_REACHED` names in `details[0].limit`. */
export const PLAN_LIMITED_RESOURCES = ['boards', 'members', 'fileSize'] as const;

export type PlanLimitedResource = (typeof PLAN_LIMITED_RESOURCES)[number];
