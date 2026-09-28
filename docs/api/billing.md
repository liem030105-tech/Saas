# API – Billing

> **Domain:** `billing` module (Phase 7). Conventions: [README](README.md). Webhook security: [security.md](../architecture/security.md#stripe-webhook).

## Plans

| | Free | Pro (demo) |
|--|------|-----------|
| Boards per workspace | 5 | Unlimited |
| Members per workspace | 5 | Unlimited |
| File size | 10 MB | 100 MB |
| Activity log retention | 7 days | Unlimited |
| Board templates | ❌ | ✅ |

Limits are defined once in `packages/shared/src/constants/plans.ts`. **The backend enforces them** in services; the FE only uses them to show upgrade prompts.

## Endpoints

| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| GET | `/workspaces/:id/billing` | ≥ ADMIN | → `200 { plan, status, currentPeriodEnd, usage: { boards, members } }` | – |
| POST | `/workspaces/:id/billing/checkout` | OWNER | → `200 { url }` (Stripe Checkout session) | `FORBIDDEN`, `CONFLICT` (already Pro) |
| POST | `/workspaces/:id/billing/portal` | OWNER | → `200 { url }` (Customer Portal) | `NOT_FOUND` (no customer yet) |
| POST | `/billing/webhook` | Public (Stripe signature verified) | raw body → `200` | `400` on invalid signature |

> Checkout/portal moved from `/billing/checkout` (previous plan) to `/workspaces/:id/billing/...` because plans are per workspace. The module has no code yet, so this change is free.

## Service responsibilities
- `billing.service`:
  - `createCheckout`: create the Stripe customer if missing, set `metadata.workspaceId`.
  - `handleWebhook`: handles `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed`, then updates `Subscription` and `Workspace.plan`. Idempotent by `event.id`.
- `assertWithinLimit(workspaceId, resource)`: called by the boards/workspaces modules before creating resources.
- Downgrading to Free never deletes data; it only blocks further creation.

## Required tests
- Invalid webhook signature → 400; the same event delivered twice is processed once.
- MEMBER/ADMIN calling checkout → 403.
- `assertWithinLimit` at the boundary: 5th resource OK, 6th → 402; a Pro workspace is unlimited.
