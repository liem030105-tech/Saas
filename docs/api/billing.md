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

Limits are defined once in `packages/shared/src/constants/plans.ts`. **Only the backend enforces them**, through `billing.service.assertWithinLimit(workspaceId, resource)`, called before creating boards, invites, and attachments. The FE uses the same constants only to show upgrade prompts. Downgrading never deletes data; it only blocks new creation.

**Shared shape:** `BillingDto = { plan, status: SubscriptionStatus | null, currentPeriodEnd, usage: { boards, members } }`

---

### GET /workspaces/:workspaceId/billing
| | |
|--|--|
| Authorization | ≥ ADMIN |
| Success | `200 { data: BillingDto }` |
| Errors | `401` · `403` · `404` |

### POST /workspaces/:workspaceId/billing/checkout
| | |
|--|--|
| Authorization | OWNER |
| Body | none |
| Success | `200 { data: { url } }`: Stripe Checkout session URL. Creates the Stripe customer if needed, with `metadata.workspaceId` set |
| Errors | `401` · `403` · `404` · `409 CONFLICT` (already Pro) |

### POST /workspaces/:workspaceId/billing/portal
| | |
|--|--|
| Authorization | OWNER |
| Success | `200 { data: { url } }`: Stripe Customer Portal URL |
| Errors | `401` · `403` · `404` (no Stripe customer yet) |

### POST /billing/webhook
| | |
|--|--|
| Authentication | Public; the Stripe signature is verified on the **raw** body |
| Success | `200 {}` |
| Errors | `400` on an invalid signature (plain response, not the JSON error format, because Stripe is the only caller) |

**Handled events:**
- `checkout.session.completed` → create/activate the Subscription and set `Workspace.plan = PRO`.
- `customer.subscription.updated` → sync `status` and `currentPeriodEnd`; `plan` is PRO while status is ACTIVE or TRIALING.
- `customer.subscription.deleted` → status CANCELED, `plan = FREE`.
- `invoice.payment_failed` → status PAST_DUE (plan stays PRO until Stripe cancels).

Processing is idempotent by `event.id`. The plan is changed **only** here, never by a FE redirect.

> Path note: the original plan used `/billing/checkout`. It is now `/workspaces/:workspaceId/billing/checkout` because plans are per workspace. No code existed, so nothing breaks.

## Required tests
- Invalid signature → 400. The same event delivered twice is applied once.
- MEMBER or ADMIN calling checkout → 403. Checkout when already Pro → 409.
- `assertWithinLimit` at the boundary (5th OK, 6th → 402); Pro → unlimited; downgrade keeps data.
