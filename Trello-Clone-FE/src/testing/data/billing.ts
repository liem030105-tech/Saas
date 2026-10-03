import { buildErrorBody } from './api';

import type { BillingDto } from '@trello-clone/shared';

// Billing test data (BILLING-001, docs/api/billing.md).

/** A Free workspace that never subscribed: 2 boards; 2 members and 1 pending invite. */
export const freeBilling: BillingDto = {
  plan: 'FREE',
  status: null,
  currentPeriodEnd: null,
  usage: { boards: 2, members: 3 },
};

/** A paying Pro workspace. */
export const proBilling: BillingDto = {
  plan: 'PRO',
  status: 'ACTIVE',
  currentPeriodEnd: '2026-11-03T00:00:00.000Z',
  usage: { boards: 7, members: 9 },
};

export const checkoutUrl = 'https://checkout.stripe.test/c/1';
export const portalUrl = 'https://billing.stripe.test/p/1';

export const alreadyProError = buildErrorBody({
  code: 'CONFLICT',
  message: 'This workspace is already on the Pro plan',
  details: [],
});

export const boardLimitError = buildErrorBody({
  code: 'PLAN_LIMIT_REACHED',
  message: 'The Free plan allows 5 boards per workspace. Upgrade to Pro for unlimited boards.',
  details: [{ limit: 'boards', message: 'The Free plan allows 5 boards per workspace.' }],
});

export const memberLimitError = buildErrorBody({
  code: 'PLAN_LIMIT_REACHED',
  message:
    'The Free plan allows 5 members per workspace, pending invites included. Upgrade to Pro for unlimited members.',
  details: [{ limit: 'members', message: 'The Free plan allows 5 members per workspace.' }],
});
