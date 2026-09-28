# AUTH-001: Register

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Status | Todo |
| Depends on | FOUNDATION-006 |
| Blocked by decisions | none |
| Skills | backend, database, frontend |

# Goal
Users can create an account and are signed in immediately.

# Context
Endpoint spec: [api/authentication.md → POST /auth/register](../api/authentication.md#post-authregister). Token mechanics: [security.md → Authentication flow](../architecture/security.md#authentication-flow).

# Requirements
1. `RefreshToken` model and migration `add_refresh_token`.
2. `auth` module: `auth.routes/controller/service.ts`; `auth/tokens.ts` with `issueAccessToken(userId)` and `createRefreshFamily(tx, userId)`; `auth/cookie.ts` with `setRefreshCookie` / `clearRefreshCookie`.
3. Register behavior exactly as specified; bcrypt cost D-03; auth rate limit D-04 applied.
4. Shared: `RegisterInputSchema`, `UserDtoSchema`, `AuthResponseSchema`.
5. FE `features/auth`: `api.ts`, a register form (React Hook Form + zodResolver), and page `/register`. On success, store the access token in memory (`api/token-store.ts`) and navigate to `/`.
6. Does **not** create a workspace (D-06 → WORKSPACE-001).

# Out of Scope
Login, refresh, logout, the `authenticate` middleware, route protection.

# Frontend Changes
`features/auth/{api.ts,components/RegisterForm.tsx}`, `pages/RegisterPage.tsx`, `api/token-store.ts`.

# Backend Changes
`modules/auth/*`, `modules/users/users.mapper.ts` (User → UserDto).

# Database Changes
Model `RefreshToken`; migration `add_refresh_token`.

# API Changes
`POST /api/v1/auth/register`.

# Realtime Changes
None.

# Security Considerations
Store only the token hash. Set the cookie attributes exactly as specified. Never return `passwordHash`. Rate limit enabled. Emails lower-cased before the uniqueness check.

# Testing
- Unit: token issuance and refresh-token hashing.
- Integration: success (201, cookie flags, body shape), 400 for each invalid field, 409 for a duplicate email (case-insensitive), 429 after the limit.
- FE: RegisterForm shows validation messages and surfaces the 409 message.

# Acceptance Criteria
- [ ] Registering returns a user + access token and sets an `HttpOnly` refresh cookie scoped to `/api/v1/auth`.
- [ ] The DB contains only the hash of the refresh token.
- [ ] Duplicate email → 409.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
FOUNDATION-006 (all foundation tasks).

# Risks
Cookie not set in dev because of `Secure` over http → drop `Secure` when `NODE_ENV=development`, as specified.
