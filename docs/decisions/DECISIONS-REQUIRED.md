# Decisions Required

> **Domain:** open questions that need **human approval**. Other docs reference them as `D-xx`.
> A value shown as *proposed default* may be used by implementation tasks **unless the item is marked blocking**. Once approved, record the decision as an ADR in [README.md](README.md), update the referencing docs, and mark the item **Resolved** here.

| Legend | Meaning |
|--------|---------|
| **Blocking: yes (TASK)** | That task must not start until the decision is made |
| **Blocking: no** | Implement with the proposed default; changing it later is a config/constant change |

---

## Security & authentication

### D-01 Access token lifetime
- **Proposed default:** 15 minutes.
- **Options:** 5–15 min (safer) · 30–60 min (fewer refreshes).
- **Affects:** `architecture/security.md`, AUTH-002, AUTH-003. **Blocking:** no (env var `ACCESS_TOKEN_TTL`).

### D-02 Refresh token lifetime
- **Proposed default:** 30 days, fixed from login (no sliding extension).
- **Options:** 7 / 14 / 30 days; sliding vs. absolute expiry.
- **Affects:** `architecture/security.md`, AUTH-003. **Blocking:** no (env var `REFRESH_TOKEN_TTL_DAYS`).

### D-03 bcrypt cost factor and library
- **Proposed default:** cost 12, library `bcryptjs` (pure JavaScript).
- **Options:** `bcryptjs` (no native build, works in CI and cloud sessions without extra setup; slower) · `bcrypt` (native, faster; needs a build-script approval under pnpm 10 and a compiler toolchain).
- **Affects:** AUTH-001, ADR-015. **Blocking:** no.

### D-04 Rate limits
- **Proposed default:** `/auth/register` and `/auth/login`: 10 requests/min/IP. Authenticated API: 300 requests/min/user.
- **Affects:** `architecture/security.md`, AUTH-001, AUTH-002, FOUNDATION-002. **Blocking:** no.

### D-05 Logout from all devices
- **Question:** expose an explicit "log out everywhere" endpoint?
- **Current state:** not supported. Password change (if D-07 = yes) revokes all sessions internally.
- **Recommendation:** not in MVP.
- **Affects:** `api/authentication.md`, AUTH-004. **Blocking:** no.

## Product scope

### D-06 Personal workspace on registration: **Resolved** (b), [ADR-019](README.md#adr-019-no-workspace-on-registration-d-06-ui-text-is-english)
- **Decision:** no workspace is created on registration; a user without one sees a "Create your first workspace" screen and names it.
- **Question:** should registering automatically create a personal workspace (user = OWNER)?
- **Context:** the previous `api/authentication.md` said yes, but the product scope never stated it.
- **Options:** (a) auto-create "<name>'s workspace"; (b) redirect to a "create your first workspace" screen.
- **Recommendation (not adopted):** (a), for fewer empty states.
- **Affects:** AUTH-001, WORKSPACE-001, `api/authentication.md`. **Blocking:** no longer (resolved).

### D-07 Change password in MVP
- **Question:** is `POST /users/me/password` part of the MVP?
- **Context:** documented in the previous API docs; the MVP scope says only "profile".
- **Recommendation:** yes, as part of AUTH-005 (it is small).
- **Affects:** AUTH-005, `api/authentication.md`. **Blocking:** no (AUTH-005 marks it optional).

### D-08 Unphased features: **Resolved** (landing and pricing in BILLING-001), [ADR-022](README.md#adr-022-landing-and-pricing-pages-in-billing-001-other-unphased-ideas-to-the-backlog-d-08)
- **Decision:** landing (`/` signed out) and pricing (`/pricing`) pages → BILLING-001 (Phase 7). Templates → post-Phase 9 backlog. Dark mode → backlog. Favorites → backlog (client-side only if ever done).
- **Question:** assign a phase or drop: board templates, dark mode, landing page, pricing page, board favorites (starring).
- **Context:** all mentioned in earlier plans or routes, but no phase or task covers them.
- **Recommendation:** landing and pricing pages → BILLING-001 (Phase 7). Templates → post-Phase 9 backlog. Dark mode → backlog. Favorites → backlog (client-side only if ever done).
- **Affects:** `plan.md`, `architecture/frontend.md` routes. **Blocking:** no longer (resolved).

### D-09 Notifications design: **Resolved** (in-app only), [ADR-021](README.md#adr-021-in-app-notifications-only-d-09)
- **Decision:** notifications are **in-app only** (a bell with a list, live over the existing Socket.IO connection); no email (D-18 stays open for invites). Triggers: being assigned to a card; a comment on a card you are a member of (or one that mentions you); a card you are a member of coming due; an invite to a workspace (for an existing account with that email). The data model, API and exact rules are written in the NOTIFICATIONS-001 spec PR first (its requirement 1).
- **Question:** which events notify whom, delivery (in-app only vs. email), and the data model (`Notification` entity).
- **Affects:** NOTIFICATIONS-001. **Blocking:** was yes; NOTIFICATIONS-001 now starts with its spec PR.

### D-28 Mention syntax in comments: **Resolved** (a)
- **Decision:** the comment composer offers the workspace's members after `@` and inserts `@[Ada Lovelace](mention:<userId>)`; the server reads the ids and keeps only workspace members; `Markdown` shows a mention as a name chip.
- **Question:** how a comment mentions someone (ADR-021's `CARD_MENTIONED` trigger, [notifications.md](../api/notifications.md#triggers)).
- **Context:** comments are raw markdown with no mention syntax today. Names are not unique, so a plain `@Ada` cannot say whom it means.
- **Options:** (a) the composer offers the workspace's members after `@` and inserts `@[Ada Lovelace](mention:<userId>)`; the server reads the ids, keeps only workspace members, and `Markdown` shows it as a name chip; (b) `@email`; (c) leave mentions out of NOTIFICATIONS-001 (a comment then notifies the card's members only).
- **Affects:** NOTIFICATIONS-001, `api/notifications.md`, `api/cards.md` (comments), the comment composer. **Blocking:** no longer (resolved).

### D-29 "Due soon" window: **Resolved** (24 hours)
- **Decision:** a card's members get `CARD_DUE_SOON` once it is due within 24 hours.
- **Question:** how long before a card's due date its members get `CARD_DUE_SOON`.
- **Affects:** NOTIFICATIONS-001. **Blocking:** no longer (resolved; a constant).

## Billing & plan limits

### D-10 Plan limit values
- **Proposed default:**

  | Limit | Free | Pro |
  |-------|------|-----|
  | Boards per workspace | 5 | unlimited |
  | Members per workspace | 5 | unlimited |
  | File size | 10 MB | 100 MB |
  | Activity retention | 7 days | unlimited |

  Counting (part of the proposed default): boards include archived ones; members include pending invites.
- **Affects:** `api/billing.md`, BILLING-001, ATTACHMENTS-001. **Blocking:** no.

### D-11 When plan limits are enforced
- **Question:** enforce Free limits from the MVP (Phases 2–3) or only once billing exists (Phase 7)?
- **Context:** the previous API docs returned `402 PLAN_LIMIT_REACHED` in board/invite creation, although billing is Phase 7.
- **Recommendation:** Phase 7 only. MVP has no limits; BILLING-001 adds `assertWithinLimit` calls to the board and invite creation paths.
- **Affects:** BOARD-001, WORKSPACE-004, BILLING-001. **Blocking:** no (default = Phase 7).

### D-12 Activity retention enforcement
- **Question:** how is Free-plan activity retention enforced? Options: scheduled delete job vs. filter-on-read.
- **Recommendation:** filter-on-read in BILLING-001; add a cleanup job only if the table grows.
- **Affects:** BILLING-001. **Blocking:** no.

### D-13 Pro pricing model: **Resolved** ($5 per member per month)
- **Decision:** Pro is priced **per member: $5 per member per month** (demo; Stripe test mode). The member count is the workspace's members, as the plan limits count them ([api/billing.md](../api/billing.md#plans-and-limits)).
- **Question:** flat price per workspace, or per member? And the amount.
- **Affects:** BILLING-001, pricing page. **Blocking:** was yes (BILLING-001).

### D-30 Pro seat count after checkout: **Resolved** (sync in a follow-up)
- **Decision:** BILLING-001 keeps setting the seats at checkout. A follow-up task after BILLING-001 makes joining and leaving members update the subscription's quantity (Stripe prorates), from the members service after commit, with a retry on failure; pending invites are not seats. The follow-up's spec settles the design and adds an ADR if it changes the architecture.
- **Question:** BILLING-001b sets the Stripe quantity to the workspace's member count when checking out. Should it follow later member changes?
- **Context:** D-13 prices Pro per member. Today a Pro workspace that grows keeps paying for the seats it had at checkout. Pending invites are not counted as seats (they count toward the Free member limit only).
- **Options:** (a) seats are set at checkout only (current behavior); (b) joining and leaving members update the subscription's quantity (Stripe prorates), from the members service after commit; (c) (b), counting pending invites too.
- **Recommendation:** (b), as a follow-up after BILLING-001 (a Stripe call on member changes, with a retry on failure).
- **Affects:** BILLING-001, `api/billing.md`, the members flow. **Blocking:** no longer (resolved).

## API conventions

### D-14 Pagination sizes
- **Proposed default:** `limit` default 20, max 100.
- **Affects:** `api/README.md`. **Blocking:** no.

### D-15 Validation length limits
- **Proposed default:** the table in [`api/README.md` → Validation rules](../api/README.md#validation-rules) (e.g. card title ≤ 200, comment ≤ 5000).
- **Affects:** all API tasks. **Blocking:** no.

### D-16 Realtime event naming
- **Question:** keep the existing `domain:verb` names (`card:moved`), or switch to dotted names (`card.moved`)?
- **Context:** the second review request used dotted names as an example; existing docs and ADR-009 use colons.
- **Recommendation:** keep `domain:verb` (common Socket.IO style, already documented).
- **Affects:** `architecture/realtime.md`, REALTIME-001. **Blocking:** no (until REALTIME-001).

### D-26 Search `due` filter meanings: **Resolved** (the proposed default)
- **Decision:** `overdue` = due date passed and not completed (as the card badge's "overdue"); `week` = due within the next 7 days (rolling, not the calendar week) and not completed; `none` = no due date (completed or not).
- **Affects:** [api/boards.md → Search](../api/boards.md#search-post-mvp-search-001), SEARCH-001 (Done). **Blocking:** no.

## Invitations & email

### D-17 Invite expiry
- **Proposed default:** 7 days.
- **Affects:** WORKSPACE-004. **Blocking:** no.

### D-18 Email delivery
- **Question:** which email provider sends invites (and future notifications)?
- **Current MVP behavior:** the invite link is returned once in the API response to ADMIN/OWNER, who copies and shares it (WORKSPACE-004). It is never logged (raw tokens stay out of logs). No email is sent.
- **Affects:** WORKSPACE-004, NOTIFICATIONS-001. **Blocking:** no for MVP.

## Files

### D-19 Upload limits and MIME allowlist
- **Proposed default:** size per D-10. Allowlist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, and Office documents (docx/xlsx/pptx).
- **Affects:** ATTACHMENTS-001. **Blocking:** no.

### D-20 File storage provider: **Resolved** (AWS S3), [ADR-020](README.md#adr-020-attachments-in-aws-s3-d-20)
- **Decision:** attachments are stored in **AWS S3** (any S3-compatible store works the same, e.g. MinIO for local development), behind `lib/storage.ts`.
- **Options were:** AWS S3 · Cloudinary.
- **Affects:** ATTACHMENTS-001, env vars. **Blocking:** was yes (ATTACHMENTS-001).

### D-27 Signed file URL lifetime
- **Question:** how long a signed attachment or cover URL works ([ADR-020](README.md#adr-020-attachments-in-aws-s3-d-20)).
- **Proposed default:** 1 hour (a page open longer refetches the card or board for fresh URLs).
- **Affects:** ATTACHMENTS-001. **Blocking:** no.

## Deployment & operations

### D-21 Hosting
- **Options (from the docs):** FE on Vercel/Netlify. BE on Render/Railway/Fly.io. DB on Neon/Supabase.
- **Affects:** DEPLOYMENT-001. **Blocking:** yes (DEPLOYMENT-001).

### D-22 Domain topology for cookies
- **Question:** will FE and API be served from the **same site**?
- **Context:** the refresh cookie is `SameSite=Strict`. A FE on `*.vercel.app` with an API on `*.onrender.com` is cross-site, so the browser will **not send the cookie**.
- **Options:** (a) same registrable domain (`app.example.com` + `api.example.com`); (b) `SameSite=None; Secure` plus CSRF protection on `/auth/refresh`.
- **Recommendation:** (a).
- **Affects:** `architecture/security.md`, DEPLOYMENT-001. **Blocking:** yes (DEPLOYMENT-001).

### D-23 Monitoring provider
- **Proposed default:** Sentry (FE + BE).
- **Affects:** DEPLOYMENT-001. **Blocking:** no.

## Design

### D-24 Visual design tokens
- **Proposed default:** the palettes, font, radius, and spacing in [design/ui.md → Visual tokens](../design/ui.md#visual-tokens-proposed-d-24): Trello-like board and label colour presets, system font, 0.5rem radius.
- **Options:** keep the proposal · supply a brand palette/typography (e.g. from a Figma file) before FOUNDATION-003.
- **Affects:** FOUNDATION-003, every FE task. **Blocking:** no (tokens live in one CSS file and can change later).

## Activity

### D-25 Activity for label and checklist changes: **Resolved** (log them)
- **Decision:** attaching and detaching a label, adding and deleting a checklist, and ticking or unticking an item log activity (`LABEL_ADDED`, `LABEL_REMOVED`, `CHECKLIST_ADDED`, `CHECKLIST_REMOVED`, `CHECKLIST_ITEM_CHECKED`), so CARD-005's acceptance line holds as written. Renames, item adds and deletes, and moves still log nothing.
- **Context:** CARD-005's acceptance line says "activity shows each action", but attaching labels and changing checklists log nothing (005a, 005c), so the feed shows assignments, comments, card edits and moves only.
- **Proposed default (approved):** log them: new `ActivityType` values for label attach/detach and checklist add/remove and item ticks, with a migration, feed texts and tests.
- **Options:** log them (the line holds as written) · reword the acceptance line to the actions that are logged today (no code change).
- **Affects:** CARD-005 (Done), `database/schema.md` (ActivityType), `api/cards.md`, `design/ui.md` (Activity). **Blocking:** was yes (CARD-005 Done).
