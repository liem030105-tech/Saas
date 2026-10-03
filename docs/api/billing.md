# API – Billing (Post-MVP, Phase 7)

> **Domain:** `billing` module, delivered by BILLING-001. Conventions, errors, permission matrix: [README](README.md). Webhook security: [security.md](../architecture/security.md#stripe-webhook).

## Plans and limits
Limit values are proposed defaults (**D-10**); the enforcement timing is **D-11**; Pro costs **$5 per member per month** (D-13, demo, Stripe test mode).

| | Free | Pro |
|--|------|-----|
| Boards per workspace | 5 | unlimited |
| Members per workspace (members + pending invites) | 5 | unlimited |
| File size | 10 MB | 100 MB |
| Activity retention | 7 days (D-12) | unlimited |

Limits are defined once in `packages/shared/src/constants/plans.ts` (`PLAN_LIMITS`). **Only the backend enforces them**, through `billing.service` (`assertWithinLimit(tx, workspaceId, resource)` for boards and members, `assertFileSize` for attachments), called before creating boards, invites, and attachments. The FE uses the same constants only to show upgrade prompts. Downgrading never deletes data; it only blocks new creation.

How each limit is counted and enforced (BILLING-001a):
- **Boards:** every board of the workspace, archived ones included (so unarchiving needs no check). Checked in `POST /workspaces/:workspaceId/boards`.
- **Members:** members plus pending (not accepted, not expired) invites. Checked in `POST /workspaces/:workspaceId/invites` (after a replaced invite for the same email is removed) and again when an invite is accepted (`POST /invites/accept`, `POST /invites/:inviteId/accept`), counted once the invite is marked accepted, so it does not count against itself; after a downgrade an invite may therefore fail to be accepted, and it stays pending.
- Boards and members are counted inside the creating transaction after locking the workspace row, so concurrent creates cannot both take the last slot.
- **File size:** the caller is authorized, then the upload is read up to the plan's limit. Over the Free limit → `402`; over the Pro limit (the largest there is) → `413 FILE_TOO_LARGE`.
- **Activity retention:** `GET /boards/:boardId/activities` leaves out entries older than the plan's retention (D-12: filtered on read; nothing is deleted, so upgrading shows them again).

Going over a limit answers `402 PLAN_LIMIT_REACHED` with `details: [{ limit, message }]`, where `limit` is `boards`, `members` or `fileSize` (`PLAN_LIMITED_RESOURCES`), so the FE can show the matching upgrade prompt.

**Shared shape:** `BillingDto = { plan, status: SubscriptionStatus | null, currentPeriodEnd, usage: { boards, members } }` (`BillingDtoSchema`). `status` and `currentPeriodEnd` are null until the workspace has subscribed once; `usage` counts as the limits do.

---

### GET /workspaces/:workspaceId/billing
| | |
|--|--|
| Task | BILLING-001a |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN (`billing.view`) |
| Success | `200 { data: BillingDto }` |
| Errors | `401` · `403` · `404` |

Checkout, portal and the webhook arrive with BILLING-001b. They need `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` and `STRIPE_WEBHOOK_SECRET` ([setup.md](../development/setup.md#environment-variables)); without them checkout and the portal answer `500 INTERNAL_ERROR` (logged) and every webhook gets `400`. Shape of both redirects: `BillingRedirectDto = { url }` (`BillingRedirectDtoSchema`).

### POST /workspaces/:workspaceId/billing/checkout
| | |
|--|--|
| Task | BILLING-001b |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | OWNER (`billing.manage`) |
| Body | none |
| Success | `200 { data: { url } }`: Stripe Checkout session URL (subscription mode, the Pro price, quantity = the workspace's member count, D-13). The first checkout creates the Stripe customer (`metadata.workspaceId`; one idempotency key per workspace, so concurrent clicks get one customer) and the workspace's `Subscription` row with status `INCOMPLETE`, which `GET …/billing` then shows until the webhook syncs a subscription. Stripe sends the browser back to `/w/:slug/settings?billing=success` or `?billing=canceled` |
| Errors | `401` · `403` · `404` · `409 CONFLICT` (already Pro, or the customer already has an active, trialing or past-due subscription in Stripe that the webhook has not synced yet, e.g. a second tab after paying) · `500` (Stripe not configured or unreachable) · `429 RATE_LIMITED` |

The seat count is set when checking out; members added or removed later do not change it yet (**D-30**, open).

### POST /workspaces/:workspaceId/billing/portal
| | |
|--|--|
| Task | BILLING-001b |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | OWNER (`billing.manage`) |
| Body | none |
| Success | `200 { data: { url } }`: Stripe Customer Portal URL, returning to `/w/:slug/settings` |
| Errors | `401` · `403` · `404` (no Stripe customer yet) · `500` · `429 RATE_LIMITED` |

### POST /billing/webhook
| | |
|--|--|
| Task | BILLING-001b |
| Authentication | Public; the `Stripe-Signature` header is verified on the **raw** body against `STRIPE_WEBHOOK_SECRET` (the route is mounted before the JSON parser) |
| Success | `200 {}` (also for events not handled, and for a subscription no workspace has) |
| Errors | `400` on a missing or invalid signature (plain `text/plain` response, not the JSON error format, because Stripe is the only caller) · `500` when processing fails (e.g. Stripe unreachable); the event is not recorded, so Stripe's retry applies it |

**Handled events:** `checkout.session.completed` (subscription mode), `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Each one names a subscription and its customer (the only fields read from the payload). In one transaction, billing records the event id, locks the workspace whose `Subscription.stripeCustomerId` is that customer, and only then **re-reads the subscription from Stripe** and syncs from what Stripe has now. Concurrent events for a workspace therefore apply in turn, each with Stripe's state at that moment, so a late, concurrent or out-of-order delivery cannot leave an old state:
- No workspace has the customer → nothing changes. A subscription whose customer (as Stripe reports it) is not the workspace's → nothing changes.
- `stripeSubId`, `status` and `currentPeriodEnd` (the latest end among its items) are stored. Status mapping: `active` → ACTIVE, `trialing` → TRIALING, `past_due` and `unpaid` → PAST_DUE, `canceled`, `incomplete_expired` and `paused` → CANCELED, `incomplete` → INCOMPLETE.
- `Workspace.plan` is PRO while the status is ACTIVE, TRIALING or PAST_DUE (a failed payment keeps Pro while Stripe retries; Stripe cancels after its retries, which downgrades), FREE otherwise. Downgrading deletes nothing.
- A subscription other than the stored one that is not active (an earlier subscription ending after a new one started) changes nothing.

So `checkout.session.completed` makes the workspace Pro, `invoice.payment_failed` makes it PAST_DUE and `customer.subscription.deleted` makes it CANCELED and FREE, as Stripe reports them. Processing is idempotent by `event.id`: the id is stored in `StripeEvent` in the transaction that applies the event, and a delivery whose id is already there changes nothing. The plan is changed **only** here, never by a FE redirect.

Local development: `stripe listen --forward-to localhost:4000/api/v1/billing/webhook` (the Stripe CLI prints the `whsec_…` secret to use), see [setup.md](../development/setup.md).

> Path note: the original plan used `/billing/checkout`. It is now `/workspaces/:workspaceId/billing/checkout` because plans are per workspace. No code existed, so nothing breaks.

## Required tests
- Invalid signature → 400. The same event delivered twice is applied once.
- MEMBER or ADMIN calling checkout → 403. Checkout when already Pro → 409.
- `assertWithinLimit` at the boundary (5th OK, 6th → 402); Pro → unlimited; downgrade keeps data.
