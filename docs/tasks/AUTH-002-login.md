# AUTH-002: Login

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Status | Todo |
| Depends on | AUTH-001 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Registered users can sign in.

# Context
Spec: [api/authentication.md → POST /auth/login](../api/authentication.md#post-authlogin).

# Requirements
1. `POST /auth/login` with a new token family on success.
2. Identical `INVALID_CREDENTIALS` response for an unknown email and a wrong password, with a dummy bcrypt compare for equal timing.
3. Auth rate limit applied.
4. Shared `LoginInputSchema`.
5. FE: login form and page `/login`, stores the access token, navigates to `/` (or to the `redirectTo` query param when it is a safe internal path).

# Out of Scope
Refresh, logout, route protection.

# Frontend Changes
`features/auth/components/LoginForm.tsx`, `pages/LoginPage.tsx`.

# Backend Changes
`auth.service.login`, route.

# Database Changes
None.

# API Changes
`POST /api/v1/auth/login`.

# Realtime Changes
None.

# Security Considerations
No user enumeration (same message, similar timing). `redirectTo` must be a relative path starting with `/` (no open redirect).

# Testing
- Integration: success, wrong password, unknown email (identical body), 400, 429.
- FE: LoginForm error display; unsafe `redirectTo` is ignored.

# Acceptance Criteria
- [ ] Valid credentials → 200 + cookie. Invalid → 401 with the same message in both cases.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
AUTH-001 (token helpers, User rows).

# Risks
Timing differences → the dummy hash compare is covered by a unit test.
