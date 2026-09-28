# Security

> **Domain:** authentication, authorization, input/output protection, secrets.

## Authentication vs. authorization
| | Authentication | Authorization |
|--|----------------|---------------|
| Question | "Who are you?" | "What may you do with this resource?" |
| Where | `authenticate` middleware (`auth` module) | `requireWorkspaceRole` + `assertBoardAccess` in services |
| Failure | `401 UNAUTHORIZED` | `404 NOT_FOUND` (non-member) / `403 FORBIDDEN` (insufficient role) |

## Tokens
- **Access token:** JWT HS256, 15-minute TTL, payload `{ sub: userId }`. Roles are not embedded (they can change). The FE keeps it in memory.
- **Refresh token:** 256-bit random string (not a JWT), 30-day TTL, sent as an `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie.
- **Storage:** the DB stores only `sha256(token)` in `RefreshToken` (with `familyId`, `expiresAt`, `revokedAt`, `replacedById`).
- **Rotation:** each `/auth/refresh` revokes the old token and issues a new one in the same `familyId`.
- **Reuse detection:** if a revoked token is presented, revoke the **entire family** and return `401 TOKEN_REUSED`.
- Logout revokes the current family; a password change revokes all of the user's families.

## Passwords
bcrypt with cost 12. Length 8–72 characters (bcrypt only uses the first 72 bytes). Never log passwords or hashes.

## HTTP
- **Helmet** with defaults; CSP is configured by the static FE host.
- **CORS:** allowlist from `CLIENT_URL`, `credentials: true`. Never `*`.
- **Rate limiting:** `/auth/login` and `/auth/register` at 10 requests/min/IP; general API at 300 requests/min/user.
- JSON body limit 1 MB.

## Input / output
- Every `body`, `params`, `query` is validated with Zod via the `validate` middleware; unknown fields are stripped.
- Prisma queries are parameterized; raw SQL only via `$queryRaw` template literals, never string concatenation.
- **Markdown** (card descriptions, comments) is stored raw; the FE renders it with `react-markdown` + `rehype-sanitize`. Never `dangerouslySetInnerHTML`.

## File uploads
- Multer memory storage, then upload to S3/Cloudinary; nothing is written to the server disk.
- MIME allowlist (images, pdf, text, office), verified by magic bytes, not just the extension.
- Size limit by plan (Free 10 MB, Pro 100 MB). File names are sanitized; storage keys are UUIDs.

## Stripe webhook
- `/billing/webhook` uses `express.raw()` and verifies with `stripe.webhooks.constructEvent` + `STRIPE_WEBHOOK_SECRET`.
- Idempotent by `event.id`. Plan status is **only changed by webhooks**, never by a FE success redirect.

## Secrets
- Secrets live only in environment variables; the repo contains `.env.example` files with empty values.
- `config/env.ts` validates env at startup and exits if anything is missing.
- The FE only receives public `VITE_*` variables (API/socket URLs). **Never** put secrets in the FE.

## Error handling and logging
- Never return stack traces or raw Prisma errors to the client.
- Logs include `requestId` and `userId`; sensitive fields (`password`, `token`, `authorization`, `cookie`) are redacted via Pino `redact`.
