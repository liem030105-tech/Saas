# AUTH-004: Logout

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Status | Todo |
| Depends on | AUTH-003 |
| Blocked by decisions | D-05 (logout-all stays out) |
| Skills | backend, frontend |

# Goal
Users can sign out of the current device.

# Context
Spec: [api/authentication.md → POST /auth/logout](../api/authentication.md#post-authlogout).

# Requirements
1. `POST /auth/logout`: revoke the current family if the cookie is valid, clear the cookie, always return 204.
2. FE: a logout action in the user menu. It calls the endpoint, clears the in-memory token and the entire query cache, then navigates to `/login`.

# Out of Scope
Logout-all (D-05).

# Frontend Changes
`features/auth/useLogout.ts`, the user menu entry in `components/layout/Header`.

# Backend Changes
`auth.service.logout`, route.

# Database Changes
None.

# API Changes
`POST /api/v1/auth/logout`.

# Realtime Changes
None.

# Security Considerations
Must work with an expired access token (cookie only). Clearing the query cache prevents data leaking to the next user on a shared machine.

# Testing
Integration: 204 with and without a cookie; refresh with the old cookie afterwards → 401. FE: logout clears the cache (hook test).

# Acceptance Criteria
- [ ] After logout, reload lands on `/login` and the old cookie cannot refresh.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
AUTH-003 (families and rotation).

# Risks
None significant.
