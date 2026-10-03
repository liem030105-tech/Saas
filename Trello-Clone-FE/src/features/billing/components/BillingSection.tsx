import { useQueryClient } from '@tanstack/react-query';
import { PLAN_LIMITS, type BillingDto, type WorkspaceDto } from '@trello-clone/shared';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { can, workspaceKeys } from '@/features/workspaces';
import { formatDate } from '@/lib/format-date';

import { PRO_PRICE_LABEL } from '../constants';
import { billingKeys, stillConfirming, useBilling, useBillingRedirect } from '../queries';

export const OWNER_ONLY_MESSAGE = 'Only a workspace owner can change the plan.';
export const CONFIRM_SLOW_MESSAGE =
  "Stripe hasn't confirmed the payment yet. Reload this page in a few minutes.";

const STATUS_TEXT: Record<NonNullable<BillingDto['status']>, string | null> = {
  ACTIVE: 'Active',
  TRIALING: 'Trial',
  PAST_DUE: 'Payment failed: update the card in "Manage billing" to keep Pro.',
  CANCELED: 'Canceled',
  // Checkout was started but not paid: nothing to say on a Free workspace.
  INCOMPLETE: null,
};

/**
 * The settings page's "Plan and billing" section (BILLING-001, docs/design/ui.md → Workspace
 * settings), for ADMIN and OWNER: the plan, its status and what the workspace uses of its limits.
 * The OWNER upgrades (Stripe Checkout) and manages billing (Stripe Customer Portal); the plan only
 * changes once Stripe's webhook arrives, so after a paid checkout the section waits for it.
 */
export function BillingSection({ workspace }: { workspace: WorkspaceDto }) {
  const [params, setParams] = useSearchParams();
  // The checkout result is read once and taken out of the URL, so a reload or a bookmark does not
  // show it (or wait for an upgrade) again.
  const [result] = useState(() => params.get('billing'));
  useEffect(() => {
    if (!params.has('billing')) return;
    setParams(
      (next) => {
        next.delete('billing');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);
  const billing = useBilling(workspace.id, result === 'success');
  const reads =
    useQueryClient().getQueryState(billingKeys.summary(workspace.id))?.dataUpdateCount ?? 0;
  const isOwner = can(workspace.role, 'billing.manage');
  const { hash } = useLocation();
  const loaded = billing.isSuccess;

  // An upgrade prompt links to `#billing`; client-side navigation does not scroll to it by itself.
  useEffect(() => {
    if (hash === '#billing' && loaded) document.getElementById('billing')?.scrollIntoView?.();
  }, [hash, loaded]);

  return (
    <section id="billing" aria-labelledby="billing-heading" className="flex flex-col gap-4">
      <h2 id="billing-heading" className="text-lg font-semibold">
        Plan and billing
      </h2>
      {billing.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : billing.isError ? (
        <div role="alert" className="flex items-center gap-2 text-sm">
          Couldn&apos;t load the plan.
          <Button variant="secondary" size="sm" onClick={() => void billing.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <BillingDetails
          workspace={workspace}
          billing={billing.data}
          result={result}
          waitedTooLong={result === 'success' && !stillConfirming(billing.data.plan, reads)}
          isOwner={isOwner}
        />
      )}
    </section>
  );
}

function BillingDetails({
  workspace,
  billing,
  result,
  waitedTooLong,
  isOwner,
}: {
  workspace: WorkspaceDto;
  billing: BillingDto;
  result: string | null;
  /** Back from a paid checkout, the webhook has not made the workspace Pro in time. */
  waitedTooLong: boolean;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const checkout = useBillingRedirect(workspace.id, 'checkout');
  const portal = useBillingRedirect(workspace.id, 'portal');
  const limits = PLAN_LIMITS[billing.plan];
  const isPro = billing.plan === 'PRO';
  const status = billing.status ? STATUS_TEXT[billing.status] : null;
  const renews =
    billing.currentPeriodEnd && (billing.status === 'ACTIVE' || billing.status === 'TRIALING')
      ? billing.currentPeriodEnd
      : null;

  // The workspace list carries the plan too (limits elsewhere in the app): refresh it on a change.
  useEffect(() => {
    if (billing.plan !== workspace.plan) {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    }
  }, [billing.plan, workspace.plan, queryClient]);

  return (
    <div className="flex flex-col gap-4">
      {result === 'success' && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {isPro
            ? 'Your workspace is on Pro now. Thank you!'
            : waitedTooLong
              ? CONFIRM_SLOW_MESSAGE
              : 'Thanks! Your payment is being confirmed; this takes a few seconds.'}
        </p>
      )}
      {result === 'canceled' && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          Checkout was canceled. Your plan hasn&apos;t changed.
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Plan</dt>
        <dd className="font-medium">{isPro ? 'Pro' : 'Free'}</dd>
        {status && (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{status}</dd>
          </>
        )}
        {renews && (
          <>
            <dt className="text-muted-foreground">Renews</dt>
            <dd>{formatDate(renews)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Boards</dt>
        <dd>{usage(billing.usage.boards, limits.boards)}</dd>
        <dt className="text-muted-foreground">Members</dt>
        <dd>
          {usage(billing.usage.members, limits.members)}
          <span className="text-muted-foreground"> (pending invites included)</span>
        </dd>
        <dt className="text-muted-foreground">Files</dt>
        <dd>up to {limits.maxFileBytes / 1024 / 1024} MB each</dd>
      </dl>

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-2">
          {!isPro && (
            <Button
              disabled={checkout.isPending || checkout.isSuccess}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending || checkout.isSuccess ? 'Opening checkout…' : 'Upgrade to Pro'}
            </Button>
          )}
          {/* A customer exists once a checkout was started (status is then set). */}
          {(isPro || billing.status !== null) && (
            <Button
              variant="secondary"
              disabled={portal.isPending || portal.isSuccess}
              onClick={() => portal.mutate()}
            >
              {portal.isPending || portal.isSuccess ? 'Opening…' : 'Manage billing'}
            </Button>
          )}
          {!isPro && (
            <span className="text-sm text-muted-foreground">
              Pro: unlimited boards and members, files up to{' '}
              {PLAN_LIMITS.PRO.maxFileBytes / 1024 / 1024} MB, {PRO_PRICE_LABEL}.
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{OWNER_ONLY_MESSAGE}</p>
      )}
    </div>
  );
}

/** "3 of 5", or just "7" when the plan has no limit. */
const usage = (used: number, limit: number | null) =>
  limit === null ? String(used) : `${used} of ${limit}`;
