import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { workspaceKeys } from '@/features/workspaces';
import { leaveTo } from '@/lib/external-navigation';

import { billingApi } from './api';

import type { BillingDto } from '@trello-clone/shared';

export const REDIRECT_ERROR = "Couldn't open Stripe. Try again in a moment.";

// Query keys: docs/api/billing.md.
export const billingKeys = {
  summary: (workspaceId: string) => ['billing', workspaceId] as const,
};

/** How often the summary is read while an upgrade is being confirmed, and how many times at most. */
export const CONFIRM_POLL_MS = 3000;
export const CONFIRM_MAX_READS = 40; // about 2 minutes

/** Whether an upgrade is still being waited for: not Pro yet, and not read too often already. */
export const stillConfirming = (plan: BillingDto['plan'] | undefined, reads: number) =>
  plan !== 'PRO' && reads < CONFIRM_MAX_READS;

/**
 * The workspace's plan, status and usage. `confirming`: back from a paid checkout, the plan changes
 * only when Stripe's webhook arrives, so the summary is read every few seconds until it is Pro (or
 * CONFIRM_MAX_READS reads, when the section says to come back later).
 */
export function useBilling(workspaceId: string, confirming = false) {
  return useQuery({
    queryKey: billingKeys.summary(workspaceId),
    queryFn: () => billingApi.summary(workspaceId),
    refetchInterval: (query) =>
      confirming && stillConfirming(query.state.data?.plan, query.state.dataUpdateCount)
        ? CONFIRM_POLL_MS
        : false,
    // Re-render on every read, even an unchanged one: the section counts them (stillConfirming).
    notifyOnChangeProps: confirming ? 'all' : undefined,
  });
}

/**
 * "Upgrade to Pro" / "Manage billing": opens a Stripe session and leaves for it. A 409 (already Pro,
 * or a payment the webhook has not confirmed yet) shows its message and refreshes the plan.
 */
export function useBillingRedirect(workspaceId: string, kind: 'checkout' | 'portal') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi[kind](workspaceId),
    onSuccess: ({ url }) => leaveTo(url),
    onError: (error) => {
      const conflict = error instanceof ApiError && error.code === 'CONFLICT';
      toast.error(conflict ? error.message : REDIRECT_ERROR);
      if (conflict) {
        void queryClient.invalidateQueries({ queryKey: billingKeys.summary(workspaceId) });
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
      }
    },
  });
}
