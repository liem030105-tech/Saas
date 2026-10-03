import Stripe from 'stripe';

import {
  setBillingProvider,
  type BillingProvider,
  type ProviderSubscription,
} from '../../src/lib/stripe';
import { testEnv } from '../data/env';

// A stand-in for Stripe (BILLING-001b): records what billing asked for and answers from what the
// test put in `subscriptions`. Every test app gets a fresh one (test-app.ts). Webhooks are signed
// with the real library and the test secret, so the signature check runs for real.

export class FakeStripe implements BillingProvider {
  readonly customers: { workspaceId: string; idempotencyKey: string; id: string }[] = [];
  readonly checkouts: Parameters<BillingProvider['createCheckoutSession']>[0][] = [];
  readonly portals: { customerId: string; returnUrl: string }[] = [];
  /** What retrieveSubscription answers, by subscription id. */
  readonly subscriptions = new Map<string, ProviderSubscription>();
  retrieved = 0;
  /** While set, createCustomer waits until this many calls have arrived (to overlap requests). */
  holdCustomersUntil: number | null = null;
  private waiting: (() => void)[] = [];

  async createCustomer(workspaceId: string, idempotencyKey: string) {
    if (this.holdCustomersUntil !== null) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        if (this.waiting.length >= this.holdCustomersUntil!) this.waiting.forEach((go) => go());
      });
    }
    // Stripe returns the same customer for the same idempotency key.
    const known = this.customers.find((c) => c.idempotencyKey === idempotencyKey);
    if (known) return known.id;
    const id = `cus_test_${this.customers.length + 1}`;
    this.customers.push({ workspaceId, idempotencyKey, id });
    return id;
  }

  createCheckoutSession(input: Parameters<BillingProvider['createCheckoutSession']>[0]) {
    this.checkouts.push(input);
    return Promise.resolve(`https://checkout.stripe.test/c/${this.checkouts.length}`);
  }

  createPortalSession(customerId: string, returnUrl: string) {
    this.portals.push({ customerId, returnUrl });
    return Promise.resolve(`https://billing.stripe.test/p/${this.portals.length}`);
  }

  retrieveSubscription(subscriptionId: string) {
    this.retrieved++;
    const sub = this.subscriptions.get(subscriptionId);
    return sub ? Promise.resolve(sub) : Promise.reject(new Error(`No such subscription`));
  }
}

/** Installs a fresh fake and returns it. */
export function installFakeStripe() {
  const fake = new FakeStripe();
  setBillingProvider(fake);
  return fake;
}

let eventCount = 0;

/** A Stripe event of `type` about `object`, as its JSON body and a valid signature header. */
export function signedEvent(type: string, object: Record<string, unknown>, id?: string) {
  eventCount++;
  const payload = JSON.stringify({
    id: id ?? `evt_test_${eventCount}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: testEnv.STRIPE_WEBHOOK_SECRET,
  });
  return { payload, signature };
}
