import { describe, expect, it } from 'vitest';

import { BillingDtoSchema } from './billing';
import { MAX_ATTACHMENT_BYTES } from '../constants/attachments';
import { PLAN_LIMITS } from '../constants/plans';

// docs/api/billing.md (BILLING-001).

const free = {
  plan: 'FREE',
  status: null,
  currentPeriodEnd: null,
  usage: { boards: 0, members: 1 },
};

describe('BillingDtoSchema', () => {
  it('reads a never-subscribed workspace and a subscribed one', () => {
    expect(BillingDtoSchema.parse(free)).toEqual(free);
    const pro = {
      ...free,
      plan: 'PRO',
      status: 'ACTIVE',
      currentPeriodEnd: '2026-11-03T00:00:00.000Z',
    };
    expect(BillingDtoSchema.parse(pro)).toEqual(pro);
  });

  it.each([
    { ...free, plan: 'TEAM' },
    { ...free, status: 'active' },
    { ...free, usage: { boards: -1, members: 1 } },
  ])('rejects %j', (dto) => {
    expect(BillingDtoSchema.safeParse(dto).success).toBe(false);
  });
});

describe('PLAN_LIMITS', () => {
  it('Pro allows more of everything than Free (D-10); the FE upload check is the Free limit', () => {
    expect(PLAN_LIMITS.PRO.maxFileBytes).toBeGreaterThan(PLAN_LIMITS.FREE.maxFileBytes);
    expect(MAX_ATTACHMENT_BYTES).toBe(PLAN_LIMITS.FREE.maxFileBytes);
  });
});
