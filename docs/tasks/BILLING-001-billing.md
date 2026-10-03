# BILLING-001: Billing, plan limits, landing and pricing

| Field | Value |
|-------|-------|
| Phase | 7 (Post-MVP) |
| Depends on | REALTIME-001 |
| Blocked by decisions | none (D-13 resolved: $5 per member per month; D-08 resolved: landing and pricing pages, ADR-022); D-10, D-11, D-12 have defaults |
| Skills | backend, database, frontend |

# Goal
Workspace owners upgrade to Pro via Stripe (test mode); Free limits are enforced.

# Context
Spec: [api/billing.md](../api/billing.md); webhook security: [security.md](../architecture/security.md#stripe-webhook).

# Requirements
1. Enum `SubscriptionStatus`; model `Subscription`; migration `add_subscriptions` (plus a `StripeEvent` table only if needed for idempotency, see schema.md).
2. Endpoints: billing summary, checkout, portal, webhook (raw body, signature, idempotent).
3. `billing.service.assertWithinLimit(workspaceId, resource)`, called from board creation, invite creation and acceptance, and attachment upload (per-plan size) – D-11.
4. Activity retention for Free applied as filter-on-read in the activities endpoint (D-12).
5. Shared `constants/plans.ts` (limits per D-10).
6. FE: billing section in workspace settings (OWNER actions, ADMIN read-only), upgrade prompts on `402`, pricing page `/pricing`, landing page `/` for signed-out visitors (D-08, ADR-022).

# Out of Scope
Invoices UI (Stripe portal covers it); taxes; multiple paid tiers.

# Frontend Changes
`features/billing/*`, `pages/PricingPage.tsx`, `pages/HomePage.tsx` (the landing page).

# Backend Changes
`modules/billing/*`, limit calls in boards, workspaces invites, and attachments.

# Database Changes
`SubscriptionStatus`, `Subscription`; migration `add_subscriptions`.

# API Changes
`GET /api/v1/workspaces/:workspaceId/billing`, `POST /api/v1/workspaces/:workspaceId/billing/checkout`, `POST /api/v1/workspaces/:workspaceId/billing/portal`, `POST /api/v1/billing/webhook`.

# Realtime Changes
None.

# Security Considerations
Only webhooks change the plan. The signature is verified on the raw body. Stripe keys only in env. OWNER-only checkout/portal.

# Testing
Integration: signature failure, idempotency, each handled event, limit boundaries (5th OK, 6th 402), role matrix. FE: upgrade prompt on 402.

# Acceptance Criteria
- [ ] Test-mode checkout upgrades the workspace; cancelling in the portal downgrades it; Free limits return 402.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
REALTIME-001 (recommended order); D-13 ($5 per member per month).

# Risks
Webhook delivery in local dev → use the Stripe CLI (documented in setup.md by this task).
