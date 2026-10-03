import { BillingRedirectDtoSchema, ErrorResponseSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { setBillingProvider } from '../../src/lib/stripe';
import { billingData } from '../data/billing';
import { testEnv } from '../data/env';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { installFakeStripe, signedEvent, type FakeStripe } from '../helpers/stripe';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// BILLING-001b: docs/api/billing.md → checkout, portal and the Stripe webhook, against a fake
// Stripe (helpers/stripe.ts) with real webhook signatures. The role matrix and tenant isolation
// of the workspace routes run in their own suites.

let app: Express;
let stripe: FakeStripe;

beforeEach(async () => {
  await resetDb();
  app = createTestApp();
  stripe = installFakeStripe();
});
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
  setBillingProvider(null);
});

type User = Awaited<ReturnType<typeof createUserWithToken>>;

async function workspaceOf(owner: User) {
  const res = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: billingData.workspaceName })
    .expect(201);
  return { workspaceId: res.body.data.id as string, slug: res.body.data.slug as string };
}

const billing = (workspaceId: string) => `${paths.workspaces}/${workspaceId}/billing`;
const checkout = (user: User, workspaceId: string) =>
  request(app)
    .post(`${billing(workspaceId)}/checkout`)
    .set(bearer(user.token));
const portal = (user: User, workspaceId: string) =>
  request(app)
    .post(`${billing(workspaceId)}/portal`)
    .set(bearer(user.token));

const deliver = ({ payload, signature }: { payload: string; signature: string }) =>
  request(app)
    .post(paths.billingWebhook)
    .set('content-type', 'application/json')
    .set('stripe-signature', signature)
    .send(payload);

const stateOf = async (workspaceId: string) => {
  const workspace = await testPrisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { subscription: true },
  });
  return { plan: workspace.plan, subscription: workspace.subscription };
};

describe('POST /workspaces/:workspaceId/billing/checkout', () => {
  it('200: the first checkout creates the customer and a pending subscription row; one seat per member', async () => {
    const owner = await createUserWithToken();
    const { workspaceId, slug } = await workspaceOf(owner);
    const member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role: 'MEMBER' },
    });

    const res = await checkout(owner, workspaceId).expect(200);
    expect(BillingRedirectDtoSchema.parse(res.body.data).url).toBe(
      'https://checkout.stripe.test/c/1',
    );
    expect(stripe.customers).toEqual([
      { workspaceId, idempotencyKey: `customer-${workspaceId}`, id: 'cus_test_1' },
    ]);
    expect(stripe.checkouts).toEqual([
      {
        customerId: 'cus_test_1',
        workspaceId,
        quantity: 2,
        successUrl: `${testEnv.CLIENT_URL}/w/${slug}/settings?billing=success`,
        cancelUrl: `${testEnv.CLIENT_URL}/w/${slug}/settings?billing=canceled`,
      },
    ]);
    // Only the webhook changes the plan.
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'FREE',
      subscription: { stripeCustomerId: 'cus_test_1', stripeSubId: null, status: 'INCOMPLETE' },
    });

    // Checking out again reuses the customer.
    await checkout(owner, workspaceId).expect(200);
    expect(stripe.customers).toHaveLength(1);
    expect(stripe.checkouts.map((c) => c.customerId)).toEqual(['cus_test_1', 'cus_test_1']);
  });

  it('two first checkouts at once make one customer and one row', async () => {
    const owner = await createUserWithToken();
    const { workspaceId } = await workspaceOf(owner);
    stripe.holdCustomersUntil = 2; // both have found no customer before either stores one

    await Promise.all([
      checkout(owner, workspaceId).expect(200),
      checkout(owner, workspaceId).expect(200),
    ]);
    expect(stripe.customers).toHaveLength(1);
    expect(await testPrisma.subscription.count()).toBe(1);
  });

  it('409 when the workspace is already Pro', async () => {
    const owner = await createUserWithToken();
    const { workspaceId } = await workspaceOf(owner);
    await testPrisma.workspace.update({ where: { id: workspaceId }, data: { plan: 'PRO' } });

    const res = await checkout(owner, workspaceId).expect(409);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('CONFLICT');
    expect(stripe.checkouts).toEqual([]);
  });

  it('401 without a token; 500 without the Stripe settings, and nothing written', async () => {
    const owner = await createUserWithToken();
    const { workspaceId } = await workspaceOf(owner);
    await request(app)
      .post(`${billing(workspaceId)}/checkout`)
      .expect(401);

    setBillingProvider(null); // the test env has no STRIPE_SECRET_KEY
    const res = await checkout(owner, workspaceId).expect(500);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('INTERNAL_ERROR');
    expect(await testPrisma.subscription.count()).toBe(0);
  });
});

describe('POST /workspaces/:workspaceId/billing/portal', () => {
  it('404 before any checkout; then 200 with a portal session that returns to the settings', async () => {
    const owner = await createUserWithToken();
    const { workspaceId, slug } = await workspaceOf(owner);
    await portal(owner, workspaceId).expect(404);

    await checkout(owner, workspaceId).expect(200);
    const res = await portal(owner, workspaceId).expect(200);
    expect(res.body.data).toEqual({ url: 'https://billing.stripe.test/p/1' });
    expect(stripe.portals).toEqual([
      { customerId: 'cus_test_1', returnUrl: `${testEnv.CLIENT_URL}/w/${slug}/settings` },
    ]);
  });

  it('401 without a token', async () => {
    const owner = await createUserWithToken();
    const { workspaceId } = await workspaceOf(owner);
    await request(app)
      .post(`${billing(workspaceId)}/portal`)
      .expect(401);
  });
});

describe('POST /billing/webhook', () => {
  /** A workspace that went through checkout (customer cus_test_1), and its subscription in Stripe. */
  async function checkedOut(status = 'active') {
    const owner = await createUserWithToken();
    const { workspaceId } = await workspaceOf(owner);
    await checkout(owner, workspaceId).expect(200);
    stripe.subscriptions.set('sub_1', {
      id: 'sub_1',
      customerId: 'cus_test_1',
      status,
      currentPeriodEnd: billingData.periodEnd,
      workspaceId,
    });
    return { owner, workspaceId };
  }

  const completed = (id?: string) =>
    signedEvent(
      'checkout.session.completed',
      {
        object: 'checkout.session',
        mode: 'subscription',
        customer: 'cus_test_1',
        subscription: 'sub_1',
      },
      id,
    );

  const setStatus = (status: string) => {
    const sub = stripe.subscriptions.get('sub_1')!;
    stripe.subscriptions.set('sub_1', { ...sub, status });
  };

  it('checkout.session.completed: the workspace becomes Pro with an active subscription', async () => {
    const { workspaceId } = await checkedOut();

    const res = await deliver(completed()).expect(200);
    expect(res.body).toEqual({});
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'PRO',
      subscription: {
        stripeSubId: 'sub_1',
        status: 'ACTIVE',
        currentPeriodEnd: billingData.periodEnd,
      },
    });
  });

  it('the same event delivered twice is applied once', async () => {
    const { workspaceId } = await checkedOut();
    const event = completed('evt_twice');
    await deliver(event).expect(200);
    // Changed meanwhile: a second application would set it back to PRO.
    await testPrisma.workspace.update({ where: { id: workspaceId }, data: { plan: 'FREE' } });

    await deliver(event).expect(200);
    expect((await stateOf(workspaceId)).plan).toBe('FREE');
    expect(await testPrisma.stripeEvent.count()).toBe(1);
  });

  it('subscription updated to past_due keeps Pro; payment failed too; deleted downgrades to Free', async () => {
    const { workspaceId } = await checkedOut();
    await deliver(completed()).expect(200);

    setStatus('past_due');
    await deliver(
      signedEvent('customer.subscription.updated', { object: 'subscription', id: 'sub_1' }),
    ).expect(200);
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'PRO',
      subscription: { status: 'PAST_DUE' },
    });

    await deliver(
      signedEvent('invoice.payment_failed', {
        object: 'invoice',
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
      }),
    ).expect(200);
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'PRO',
      subscription: { status: 'PAST_DUE' },
    });

    setStatus('canceled');
    await deliver(
      signedEvent('customer.subscription.deleted', { object: 'subscription', id: 'sub_1' }),
    ).expect(200);
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'FREE',
      subscription: { status: 'CANCELED' },
    });
    // Downgrading keeps the row (and every board, member and file).
    expect(await testPrisma.subscription.count()).toBe(1);
  });

  it('a late event is synced from the subscription as Stripe has it now, not from its payload', async () => {
    const { workspaceId } = await checkedOut('canceled');

    // An old "active" update arrives after the cancellation.
    await deliver(
      signedEvent('customer.subscription.updated', {
        object: 'subscription',
        id: 'sub_1',
        status: 'active',
      }),
    ).expect(200);
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'FREE',
      subscription: { status: 'CANCELED' },
    });
  });

  it("an earlier subscription ending does not downgrade the workspace's current one", async () => {
    const { workspaceId } = await checkedOut();
    await deliver(completed()).expect(200);
    stripe.subscriptions.set('sub_old', {
      id: 'sub_old',
      customerId: 'cus_test_1',
      status: 'canceled',
      currentPeriodEnd: null,
      workspaceId,
    });

    await deliver(
      signedEvent('customer.subscription.deleted', { object: 'subscription', id: 'sub_old' }),
    ).expect(200);
    expect(await stateOf(workspaceId)).toMatchObject({
      plan: 'PRO',
      subscription: { stripeSubId: 'sub_1' },
    });
  });

  it('other events and unknown customers are acknowledged and change nothing', async () => {
    const { workspaceId } = await checkedOut();
    stripe.subscriptions.set('sub_stranger', {
      id: 'sub_stranger',
      customerId: 'cus_stranger',
      status: 'active',
      currentPeriodEnd: null,
      workspaceId: null,
    });

    await deliver(signedEvent('customer.created', { object: 'customer', id: 'cus_test_1' })).expect(
      200,
    );
    await deliver(
      signedEvent('customer.subscription.updated', { object: 'subscription', id: 'sub_stranger' }),
    ).expect(200);
    expect(stripe.retrieved).toBe(1); // only the subscription event reads Stripe
    expect((await stateOf(workspaceId)).plan).toBe('FREE');
  });

  it('500 when Stripe cannot be read; the event is not recorded, so its retry applies it', async () => {
    const { workspaceId } = await checkedOut();
    const sub = stripe.subscriptions.get('sub_1')!;
    stripe.subscriptions.delete('sub_1');
    const event = completed('evt_retry');

    await deliver(event).expect(500);
    expect(await testPrisma.stripeEvent.count()).toBe(0);

    stripe.subscriptions.set('sub_1', sub);
    await deliver(event).expect(200);
    expect((await stateOf(workspaceId)).plan).toBe('PRO');
  });

  it('400 (plain text) for a missing, wrong or stale signature or a changed body; nothing changes', async () => {
    const { workspaceId } = await checkedOut();
    const event = completed();
    const wrong = signedEvent('checkout.session.completed', {}).signature; // signs another body

    for (const res of [
      await request(app)
        .post(paths.billingWebhook)
        .set('content-type', 'application/json')
        .send(event.payload),
      await deliver({ payload: event.payload, signature: wrong }),
      await deliver({ payload: event.payload, signature: 't=1,v1=00' }),
      await deliver({
        payload: event.payload.replace('sub_1', 'sub_2'),
        signature: event.signature,
      }),
    ]) {
      expect(res.status).toBe(400);
      expect(res.type).toBe('text/plain');
      expect(res.text).toBe('Invalid signature');
    }
    expect((await stateOf(workspaceId)).plan).toBe('FREE');
    expect(await testPrisma.stripeEvent.count()).toBe(0);
  });
});
