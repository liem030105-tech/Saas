import Stripe from 'stripe';

import { env } from '../config/env';

// Stripe (BILLING-001, test mode): the few calls billing makes, behind an interface so tests swap
// in a fake (setBillingProvider) and never reach Stripe. Webhook signatures are always checked
// with the real library (verifyWebhookEvent), against STRIPE_WEBHOOK_SECRET.

/** A subscription as billing syncs it. */
export interface ProviderSubscription {
  id: string;
  customerId: string;
  /** Stripe's status (`active`, `past_due`, …). */
  status: string;
  /** The end of the current period (the latest of its items'); null if it has none. */
  currentPeriodEnd: Date | null;
  /** `metadata.workspaceId`, set at checkout. */
  workspaceId: string | null;
}

export interface BillingProvider {
  /** A customer for the workspace; the same key returns the same customer (Stripe idempotency). */
  createCustomer(workspaceId: string, idempotencyKey: string): Promise<string>;
  /** A Checkout session for `quantity` Pro seats; returns its URL. */
  createCheckoutSession(input: {
    customerId: string;
    workspaceId: string;
    quantity: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  /** A Customer Portal session; returns its URL. */
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
  retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription>;
}

const notConfigured = (what: string) => new Error(`Billing is not configured: ${what} is not set`);

export class StripeProvider implements BillingProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly priceId: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCustomer(workspaceId: string, idempotencyKey: string) {
    const customer = await this.stripe.customers.create(
      { metadata: { workspaceId } },
      { idempotencyKey },
    );
    return customer.id;
  }

  async createCheckoutSession(input: Parameters<BillingProvider['createCheckoutSession']>[0]) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.workspaceId,
      line_items: [{ price: this.priceId, quantity: input.quantity }],
      subscription_data: { metadata: { workspaceId: input.workspaceId } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned a Checkout session without a URL');
    return session.url;
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  async retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const ends = sub.items.data.map((item) => item.current_period_end);
    return {
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      currentPeriodEnd: ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null,
      workspaceId: sub.metadata.workspaceId ?? null,
    };
  }
}

/** Without the Stripe settings every call fails (logged by the error handler as a 500). */
class MissingProvider implements BillingProvider {
  constructor(private readonly what: string) {}
  createCustomer(): Promise<string> {
    return Promise.reject(notConfigured(this.what));
  }
  createCheckoutSession(): Promise<string> {
    return Promise.reject(notConfigured(this.what));
  }
  createPortalSession(): Promise<string> {
    return Promise.reject(notConfigured(this.what));
  }
  retrieveSubscription(): Promise<ProviderSubscription> {
    return Promise.reject(notConfigured(this.what));
  }
}

let provider: BillingProvider | null = null;

export function billingProvider(): BillingProvider {
  provider ??=
    env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO
      ? new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_PRICE_PRO)
      : new MissingProvider(env.STRIPE_SECRET_KEY ? 'STRIPE_PRICE_PRO' : 'STRIPE_SECRET_KEY');
  return provider;
}

/** Tests replace the provider (and back with `null`). */
export function setBillingProvider(next: BillingProvider | null) {
  provider = next;
}

/**
 * The event, if `signature` (the `Stripe-Signature` header) signs `rawBody` with the webhook
 * secret; null otherwise, and always while STRIPE_WEBHOOK_SECRET is unset.
 */
export function verifyWebhookEvent(
  rawBody: Buffer,
  signature: string | undefined,
): Stripe.Event | null {
  if (!env.STRIPE_WEBHOOK_SECRET || !signature) return null;
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}

export type { Stripe };
