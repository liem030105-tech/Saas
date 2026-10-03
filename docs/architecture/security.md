# Security

> **Domain:** authentication flow, token mechanics, HTTP hardening, input/output safety, secrets.
> **Authorization** (roles, permission matrix, tenant isolation) is specified once in [api/README.md → Authorization model](../api/README.md#authorization-model). Values marked `D-xx` are proposed defaults pending [DECISIONS-REQUIRED](../decisions/DECISIONS-REQUIRED.md).

## Authentication vs. authorization
| | Authentication | Authorization |
|--|----------------|---------------|
| Question | Who is calling? | May they do this to this resource? |
| Where | `authenticate` middleware (verifies the access token, sets `req.userId`) | `assertWorkspaceAccess` / `assertBoardAccess` in services, `requireWorkspaceRole` on workspace routes |
| Failure | `401 UNAUTHORIZED` | `404 NOT_FOUND` (non-member) / `403 FORBIDDEN` (insufficient role) |

## Authentication flow

```
 Browser (FE)                                   API (BE)                               DB
 ────────────                                   ────────                               ──
 1. POST /auth/register {email,password,name} ─▶ hash pw (bcrypt) ─ create User ──────▶ User
    or POST /auth/login {email,password}         new family: raw token R1 ─ store sha256(R1) ▶ RefreshToken
 ◀── 201/200 { accessToken A1 } + Set-Cookie refresh_token=R1 (HttpOnly)
 2. keep A1 in memory (never localStorage)
 3. GET /api/v1/... Authorization: Bearer A1 ─▶ verify JWT signature + exp → req.userId
 4. ... A1 expires (D-01) → API returns 401 UNAUTHORIZED
 5. POST /auth/refresh (cookie R1 sent automatically) ─▶ find sha256(R1)
       valid & not revoked → revoke R1, create R2 (same family, R1.replacedById=R2) ▶ RefreshToken
 ◀── 200 { accessToken A2 } + Set-Cookie refresh_token=R2
 6. retry the original request with A2
 7. R1 presented again (stolen/replayed) → revoke whole family → 401 TOKEN_REUSED, cookie cleared
 8. POST /auth/logout → revoke current family → 204, cookie cleared
```

### Parameters
| Item | Value |
|------|-------|
| Access token | JWT HS256 signed with `JWT_ACCESS_SECRET`; payload `{ sub: userId, iat, exp }`; roles are **not** embedded (they can change) |
| Access token lifetime | 15 minutes (**D-01**) |
| Refresh token | 256-bit random value, base64url; **not** a JWT |
| Refresh token lifetime | 30 days, absolute from login; rotation keeps the family's original expiry (**D-02**) |
| Refresh cookie | `refresh_token`; `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. FE and API share one registrable domain in production (`app.<domain>`, `api.<domain>`; D-22, ADR-023), so it is sent |
| Token storage (server) | only `sha256(token)` in `RefreshToken.tokenHash` |
| Rotation | every successful `/auth/refresh` revokes the presented token and issues a successor in the same `familyId` |
| Reuse detection | presenting a revoked token revokes **every** token in its family → `401 TOKEN_REUSED` |
| Logout | revokes the current family only; other devices stay signed in |
| Logout-all | **not supported** (**D-05**); a password change (if **D-07** is approved) revokes all other families |
| Password hashing | bcrypt, cost 12 (**D-03**); passwords 8–72 chars |
| Login timing | an unknown email still runs a bcrypt compare against a dummy hash |
| Rate limiting | `/auth/register`, `/auth/login`: 10/min/IP; authenticated API: 300/min/user (**D-04**) → `429 RATE_LIMITED` + `Retry-After` |

### Frontend token handling
- The access token lives in a module-scoped variable in `src/api`; the refresh token is never readable by JS.
- On app start the FE calls `/auth/refresh` once to restore the session.
- On `401 UNAUTHORIZED`, a single shared refresh promise is used; concurrent requests wait for it, then retry once. If the refresh returns 401 → clear state and redirect to `/login`; a 5xx or network error leaves the session as is and surfaces as an error.
- `TOKEN_REUSED` → force logout and show "session expired".
- A request that fails with a token already replaced by a concurrent refresh retries with the new token instead of refreshing again.
- Known limitation (accepted for the MVP): two browser tabs refreshing the same cookie at the same moment trip reuse detection and sign the user out. A short grace window would fix it and needs an ADR.

### CSRF
- Bearer-authenticated endpoints are not CSRF-prone.
- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) rely on `SameSite=Strict` plus the CORS allowlist. FE and API stay on one site (D-22, ADR-023); moving them to different sites would need `SameSite=None` and a CSRF token for these two endpoints.

## HTTP hardening
- **Helmet** defaults on the API. The FE host sets the CSP.
- **CORS:** allowlist from `CLIENT_URL`, `credentials: true`, never `*`.
- JSON body limit 1 MB. Every response carries `X-Request-Id`.

## Input / output
- Every `body`, `params`, and `query` is validated with Zod in the `validate` middleware; unknown fields are stripped ([rules](../api/README.md#validation-rules)).
- Prisma queries are parameterized. Raw SQL only via `$queryRaw` tagged templates.
- **Markdown** (card descriptions, comments) is stored raw and rendered by the FE only through `components/ui/Markdown.tsx` (CARD-002): `react-markdown` with `skipHtml` + `rehype-sanitize`, links with `target="_blank" rel="noopener noreferrer"`. Its test covers script tags, event handlers, `javascript:` links and iframes. Never `dangerouslySetInnerHTML`.

## File uploads (ATTACHMENTS-001)
- Multer memory storage → AWS S3 (D-20, ADR-020), a private bucket. Nothing is written to server disk. Files are read only through signed GET URLs the API mints per response (lifetime D-27); no URL is stored.
- MIME allowlist (**D-19**) verified by magic bytes, not the extension. Size by plan (**D-10**, BILLING-001): the caller is authorized first, then the upload is read only up to the card's workspace plan's limit, so a Free workspace (or a non-member) never makes the server buffer more than 10 MB.
- File names are sanitized. Storage keys are `<workspaceId>/<cardId>/<uuid>`.

## Stripe webhook
- `/billing/webhook` is mounted before the JSON parser and uses `express.raw()` and `Stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET` (default tolerance: a signature older than 5 minutes is refused). A missing or invalid signature gets a plain `400`; without the secret every webhook is refused.
- The event's payload is not trusted for state: billing re-reads the subscription from Stripe with the secret key and syncs from that.
- Idempotent by `event.id` (`StripeEvent`). The plan changes **only** via webhooks; checkout and portal (OWNER only) never change it.

## Secrets
- Secrets live only in environment variables. The repo has `.env.example` files with empty values.
- `config/env.ts` validates env at startup and exits on missing values.
- The FE receives only public `VITE_*` values. **Never** put secrets in the FE.

## Error handling and logging
- Never return stack traces or raw Prisma errors.
- Logs include `requestId` and `userId`. Pino `redact` removes `password`, `token`, `authorization`, `cookie`, and `set-cookie`.
