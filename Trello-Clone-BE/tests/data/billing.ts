// Billing test data (BILLING-001, docs/api/billing.md).

export const billingData = {
  workspaceName: 'Agency',
  boardTitle: (n: number) => `Board ${n}`,
  listTitle: 'To do',
  cardTitle: 'Logo',
  inviteEmail: (n: number) => `guest${n}@example.com`,
  /** The end of a paid period, as Stripe would report it. */
  periodEnd: new Date('2026-11-03T00:00:00.000Z'),
};
