import { PLAN_LIMITS } from '@trello-clone/shared';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { billingProvider, type ProviderSubscription, type Stripe } from '../../lib/stripe';
import { lockWorkspace } from '../workspaces/workspaces.service';

import type { Plan, Prisma, SubscriptionStatus } from '../../generated/prisma/client';
import type { BillingDto, BillingRedirectDto, PlanLimitedResource } from '@trello-clone/shared';

// docs/api/billing.md (BILLING-001). Limits are PLAN_LIMITS (D-10); only this module enforces them.
// Downgrading never deletes anything: it only blocks creating more.

type Tx = Prisma.TransactionClient;

/** What a create checks: one more board, or one more member or invite. */
export type LimitedResource = 'boards' | 'members';

const MB = 1024 * 1024;

/** Members plus pending invites, as the member limit counts them. */
async function countMembers(tx: Tx, workspaceId: string) {
  const [members, invites] = await Promise.all([
    tx.workspaceMember.count({ where: { workspaceId } }),
    tx.workspaceInvite.count({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return members + invites;
}

/** Boards, archived ones included (unarchiving needs no check). */
const countBoards = (tx: Tx, workspaceId: string) => tx.board.count({ where: { workspaceId } });

async function planOf(tx: Tx, workspaceId: string): Promise<Plan> {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (!workspace) throw AppError.notFound();
  return workspace.plan;
}

const limitReached = (limit: PlanLimitedResource, message: string) =>
  new AppError('PLAN_LIMIT_REACHED', 402, message, [{ limit, message }]);

/**
 * Throws `402 PLAN_LIMIT_REACHED` when one more `resource` would go over the workspace's plan.
 * Call it inside the creating transaction, before the insert: it locks the workspace row first
 * (lockWorkspace), so concurrent creates count in turn.
 */
export async function assertWithinLimit(
  tx: Tx,
  workspaceId: string,
  resource: LimitedResource,
): Promise<void> {
  await lockWorkspace(tx, workspaceId);
  const limits = PLAN_LIMITS[await planOf(tx, workspaceId)];
  switch (resource) {
    case 'boards':
      if (limits.boards !== null && (await countBoards(tx, workspaceId)) >= limits.boards) {
        throw limitReached(
          'boards',
          `The Free plan allows ${limits.boards} boards per workspace. Upgrade to Pro for unlimited boards.`,
        );
      }
      return;
    case 'members':
      if (limits.members !== null && (await countMembers(tx, workspaceId)) >= limits.members) {
        throw limitReached(
          'members',
          `The Free plan allows ${limits.members} members per workspace, pending invites included. Upgrade to Pro for unlimited members.`,
        );
      }
      return;
  }
}

/** Throws when a file of `bytes` is over the workspace's plan (no transaction needed). */
export async function assertFileSize(workspaceId: string, bytes: number): Promise<void> {
  const plan = await currentPlan(workspaceId);
  if (bytes > PLAN_LIMITS[plan].maxFileBytes) throw fileTooLarge(plan);
}

/**
 * Over the plan's largest file: on Free, an upgrade helps (402); on Pro, the largest there is (413).
 * Also used by the upload middleware, which stops reading at the plan's limit.
 */
export function fileTooLarge(plan: Plan): AppError {
  const max = PLAN_LIMITS[plan].maxFileBytes / MB;
  if (plan === 'FREE') {
    return limitReached(
      'fileSize',
      `Files can be at most ${max} MB on the Free plan. Upgrade to Pro for files up to ${PLAN_LIMITS.PRO.maxFileBytes / MB} MB.`,
    );
  }
  return new AppError('FILE_TOO_LARGE', 413, `The file is larger than ${max} MB`);
}

/** The workspace's plan (no lock; for reads that only adapt to it). */
export const currentPlan = (workspaceId: string) => planOf(prisma, workspaceId);

/**
 * The oldest activity the workspace's plan still shows (D-12: filtered on read, nothing is
 * deleted, so upgrading shows it all again); null = all of it.
 */
export async function activitySince(workspaceId: string): Promise<Date | null> {
  const days = PLAN_LIMITS[await currentPlan(workspaceId)].activityRetentionDays;
  return days === null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** GET /workspaces/:workspaceId/billing (≥ ADMIN; the route checks it). */
export async function getSummary(workspaceId: string): Promise<BillingDto> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, subscription: { select: { status: true, currentPeriodEnd: true } } },
  });
  if (!workspace) throw AppError.notFound();
  const [boards, members] = await Promise.all([
    countBoards(prisma, workspaceId),
    countMembers(prisma, workspaceId),
  ]);
  return {
    plan: workspace.plan,
    status: workspace.subscription?.status ?? null,
    currentPeriodEnd: workspace.subscription?.currentPeriodEnd?.toISOString() ?? null,
    usage: { boards, members },
  };
}

// Stripe (BILLING-001b). The plan changes only in handleWebhookEvent, never on a redirect.

const alreadyPro = () => new AppError('CONFLICT', 409, 'This workspace is already on the Pro plan');

const settingsUrl = (slug: string, result?: 'success' | 'canceled') =>
  `${env.CLIENT_URL}/w/${slug}/settings${result ? `?billing=${result}` : ''}`;

/**
 * POST /workspaces/:workspaceId/billing/checkout (OWNER; the route checks it). Creates the
 * workspace's Stripe customer on the first checkout (the Subscription row then exists with status
 * INCOMPLETE until a subscription is synced), then a Checkout session for one Pro seat per member
 * (D-13). Already Pro, or a live subscription in Stripe that the webhook has not synced yet → 409.
 */
export async function checkout(workspaceId: string): Promise<BillingRedirectDto> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, slug: true, subscription: { select: { stripeCustomerId: true } } },
  });
  if (!workspace) throw AppError.notFound();
  if (workspace.plan === 'PRO') throw alreadyPro();
  const provider = billingProvider();
  let customerId = workspace.subscription?.stripeCustomerId ?? null;
  // Paid but the webhook has not landed yet (a second tab, a second click): no second subscription.
  if (customerId && (await provider.hasLiveSubscription(customerId))) throw alreadyPro();
  if (!customerId) {
    // The same key for every first checkout of this workspace: concurrent clicks get one customer.
    customerId = await provider.createCustomer(workspaceId, `customer-${workspaceId}`);
    await prisma.subscription.createMany({
      data: [{ workspaceId, stripeCustomerId: customerId, status: 'INCOMPLETE' }],
      skipDuplicates: true,
    });
    await prisma.subscription.updateMany({
      where: { workspaceId, stripeCustomerId: null },
      data: { stripeCustomerId: customerId },
    });
  }
  const quantity = await prisma.workspaceMember.count({ where: { workspaceId } });
  const url = await provider.createCheckoutSession({
    customerId,
    workspaceId,
    quantity,
    successUrl: settingsUrl(workspace.slug, 'success'),
    cancelUrl: settingsUrl(workspace.slug, 'canceled'),
  });
  return { url };
}

/** POST /workspaces/:workspaceId/billing/portal (OWNER): 404 until checkout made a customer. */
export async function portal(workspaceId: string): Promise<BillingRedirectDto> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true, subscription: { select: { stripeCustomerId: true } } },
  });
  const customerId = workspace?.subscription?.stripeCustomerId;
  if (!workspace || !customerId)
    throw AppError.notFound('This workspace has no billing account yet');
  return {
    url: await billingProvider().createPortalSession(customerId, settingsUrl(workspace.slug)),
  };
}

/** Stripe's subscription status → ours (docs/api/billing.md → Handled events). */
const STATUS: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete_expired: 'CANCELED',
  paused: 'CANCELED',
  incomplete: 'INCOMPLETE',
};

/** Pro while paid or being retried; Stripe cancels after its retries, which downgrades. */
const PRO_STATUSES = new Set<SubscriptionStatus>(['ACTIVE', 'TRIALING', 'PAST_DUE']);

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);

/**
 * The subscription and customer an event is about, for the events billing handles; null for any
 * other. Only these ids are read from the payload; the state comes from Stripe.
 */
function targetOf(event: Stripe.Event): { subscriptionId: string; customerId: string } | null {
  let subscriptionId: string | null;
  let customerId: string | null;
  switch (event.type) {
    case 'checkout.session.completed':
      if (event.data.object.mode !== 'subscription') return null;
      subscriptionId = idOf(event.data.object.subscription);
      customerId = idOf(event.data.object.customer);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      subscriptionId = event.data.object.id;
      customerId = idOf(event.data.object.customer);
      break;
    case 'invoice.payment_failed':
      subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      customerId = idOf(event.data.object.customer);
      break;
    default:
      return null;
  }
  return subscriptionId && customerId ? { subscriptionId, customerId } : null;
}

/** Room for the Stripe read inside the webhook's transaction (Prisma's default is 5 s). */
const WEBHOOK_TX_TIMEOUT_MS = 20_000;

/**
 * POST /billing/webhook, after the signature check. In one transaction: the event id is recorded
 * (a delivery already recorded changes nothing), the workspace whose Stripe customer it is gets
 * locked, and only then is the subscription read from Stripe and synced (status, period end,
 * `Workspace.plan`). Concurrent events for a workspace therefore apply in turn, each with what
 * Stripe has when it holds the lock, so a late or out-of-order delivery cannot leave an old state.
 * A failure (e.g. Stripe unreachable) rolls the record back too, so Stripe's retry applies it.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const target = targetOf(event);
  if (!target) return;
  await prisma.$transaction(
    async (tx) => {
      // ON CONFLICT DO NOTHING: a concurrent duplicate waits for the first, then counts 0.
      const { count } = await tx.stripeEvent.createMany({
        data: [{ id: event.id }],
        skipDuplicates: true,
      });
      if (count === 0) return;
      const owner = await tx.subscription.findUnique({
        where: { stripeCustomerId: target.customerId },
        select: { workspaceId: true },
      });
      if (!owner) {
        logger.warn({ eventId: event.id }, 'Stripe event for a customer no workspace has');
        return;
      }
      await lockWorkspace(tx, owner.workspaceId);
      const row = await tx.subscription.findUniqueOrThrow({
        where: { workspaceId: owner.workspaceId },
      });
      const sub = await billingProvider().retrieveSubscription(target.subscriptionId);
      if (sub.customerId !== row.stripeCustomerId) {
        logger.warn(
          { eventId: event.id },
          "Stripe subscription of another customer than the event's",
        );
        return;
      }
      await syncSubscription(tx, row, sub);
    },
    { timeout: WEBHOOK_TX_TIMEOUT_MS },
  );
}

async function syncSubscription(
  tx: Tx,
  row: { id: string; workspaceId: string; stripeSubId: string | null },
  sub: ProviderSubscription,
) {
  const status = STATUS[sub.status] ?? 'INCOMPLETE';
  // An earlier subscription ending (after a new one started) is not this workspace's news.
  if (row.stripeSubId && row.stripeSubId !== sub.id && !PRO_STATUSES.has(status)) return;
  await tx.subscription.update({
    where: { id: row.id },
    data: { stripeSubId: sub.id, status, currentPeriodEnd: sub.currentPeriodEnd },
  });
  await tx.workspace.update({
    where: { id: row.workspaceId },
    data: { plan: PRO_STATUSES.has(status) ? 'PRO' : 'FREE' },
  });
}
