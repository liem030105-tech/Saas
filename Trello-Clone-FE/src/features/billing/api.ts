import { apiClient } from '@/api/client';

import type { BillingDto, BillingRedirectDto } from '@trello-clone/shared';

/** A workspace's plan and billing (docs/api/billing.md). */
export const billingApi = {
  /** GET /workspaces/:workspaceId/billing (≥ ADMIN). */
  summary: (workspaceId: string) => apiClient.get<BillingDto>(`/workspaces/${workspaceId}/billing`),
  /** POST /workspaces/:workspaceId/billing/checkout (OWNER): a Stripe Checkout URL. */
  checkout: (workspaceId: string) =>
    apiClient.post<BillingRedirectDto>(`/workspaces/${workspaceId}/billing/checkout`),
  /** POST /workspaces/:workspaceId/billing/portal (OWNER): a Stripe Customer Portal URL. */
  portal: (workspaceId: string) =>
    apiClient.post<BillingRedirectDto>(`/workspaces/${workspaceId}/billing/portal`),
};
