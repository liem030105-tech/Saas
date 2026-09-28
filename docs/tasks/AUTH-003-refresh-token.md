# AUTH-003: Refresh token rotation

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Depends on | AUTH-002 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Sessions survive access-token expiry and page reloads, with rotation and reuse detection.

# Context
Spec: [api/authentication.md → POST /auth/refresh](../api/authentication.md#post-authrefresh); flow and parameters: [security.md](../architecture/security.md#authentication-flow).

# Requirements
1. `POST /auth/refresh`: in one transaction, rotate (revoke the old token, create its successor, link `replacedById`) while keeping the family's original expiry (D-02).
2. Reuse detection: presenting a revoked token revokes the whole family → `401 TOKEN_REUSED` and clears the cookie.
3. FE `api/client.ts` interceptor: on `401 UNAUTHORIZED` from a non-auth endpoint, run a single shared refresh promise, then retry the request once. If the refresh fails, clear the token and redirect to `/login?redirectTo=…`.
4. FE session bootstrap: call `/auth/refresh` once on app start before rendering protected routes.

# Out of Scope
Logout (AUTH-004), the `authenticate` middleware and `/auth/me` (AUTH-005).

# Frontend Changes
`api/client.ts` (interceptor), `api/token-store.ts`, `features/auth/session.ts` (bootstrap).

# Backend Changes
`auth.service.refresh`, route.

# Database Changes
None.

# API Changes
`POST /api/v1/auth/refresh`.

# Realtime Changes
None.

# Security Considerations
The comparison uses the hash lookup. Revoke the family on reuse. Concurrent FE refreshes must be de-duplicated, otherwise legitimate users trigger reuse detection.

# Testing
- Integration: rotation success; replaying the old token → `TOKEN_REUSED` and the successor becomes invalid; expired → 401; missing cookie → 401.
- FE hook/unit: two concurrent 401s trigger exactly one refresh (MSW); a failed refresh redirects to login.

# Acceptance Criteria
- [ ] After access-token expiry, the user's next request succeeds transparently.
- [ ] Reload keeps the user signed in.
- [ ] A replayed refresh token kills the session.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
AUTH-002 (issued cookies).

# Risks
A race between two tabs refreshing at once can trigger reuse detection → accepted for MVP (documented). Mitigation if it becomes a problem: a short grace window, which would need an ADR.
