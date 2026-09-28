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

### D-06 Personal workspace on registration
- **Question:** should registering automatically create a personal workspace (user = OWNER)?
- **Context:** the previous `api/authentication.md` said yes, but the product scope never stated it.
- **Options:** (a) auto-create "<name>'s workspace"; (b) redirect to a "create your first workspace" screen.
- **Recommendation:** (a), for fewer empty states. If approved, WORKSPACE-001 adds it (not AUTH-001, which runs before the Workspace model exists).
- **Affects:** AUTH-001, WORKSPACE-001, `api/authentication.md`. **Blocking:** yes (WORKSPACE-001).

### D-07 Change password in MVP
- **Question:** is `POST /users/me/password` part of the MVP?
- **Context:** documented in the previous API docs; the MVP scope says only "profile".
- **Recommendation:** yes, as part of AUTH-005 (it is small).
- **Affects:** AUTH-005, `api/authentication.md`. **Blocking:** no (AUTH-005 marks it optional).

### D-08 Unphased features
- **Question:** assign a phase or drop: board templates, dark mode, landing page, pricing page, board favorites (starring).
- **Context:** all mentioned in earlier plans or routes, but no phase or task covers them.
- **Recommendation:** landing and pricing pages → BILLING-001 (Phase 7). Templates → post-Phase 9 backlog. Dark mode → backlog. Favorites → backlog (client-side only if ever done).
- **Affects:** `plan.md`, `architecture/frontend.md` routes. **Blocking:** no.

### D-09 Notifications design
- **Question:** which events notify whom, delivery (in-app only vs. email), and the data model (`Notification` entity).
- **Context:** Phase 6 lists "notifications", but no entity or API exists in the specification.
- **Affects:** NOTIFICATIONS-001. **Blocking:** yes (NOTIFICATIONS-001 needs a spec first).

## Billing & plan limits

### D-10 Plan limit values
- **Proposed default:**

  | Limit | Free | Pro |
  |-------|------|-----|
  | Boards per workspace | 5 | unlimited |
  | Members per workspace | 5 | unlimited |
  | File size | 10 MB | 100 MB |
  | Activity retention | 7 days | unlimited |

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

### D-13 Pro pricing model
- **Question:** flat price per workspace, or per member? And the amount (the earlier plan said "$5/user/month – demo").
- **Affects:** BILLING-001, pricing page. **Blocking:** yes (BILLING-001).

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

## Invitations & email

### D-17 Invite expiry
- **Proposed default:** 7 days.
- **Affects:** WORKSPACE-004. **Blocking:** no.

### D-18 Email delivery
- **Question:** which email provider sends invites (and future notifications)?
- **Current MVP behavior:** the invite link is returned in the API response to ADMIN/OWNER and logged in development. No email is sent.
- **Affects:** WORKSPACE-004, NOTIFICATIONS-001. **Blocking:** no for MVP.

## Files

### D-19 Upload limits and MIME allowlist
- **Proposed default:** size per D-10. Allowlist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, and Office documents (docx/xlsx/pptx).
- **Affects:** ATTACHMENTS-001. **Blocking:** no.

### D-20 File storage provider
- **Options:** AWS S3 · Cloudinary.
- **Affects:** ATTACHMENTS-001, env vars. **Blocking:** yes (ATTACHMENTS-001).

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
