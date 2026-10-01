# AUTH-005: Current user, profile, route protection

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Depends on | AUTH-002 |
| Blocked by decisions | D-07 (only the optional password-change part) |
| Skills | backend, frontend |

# Goal
Protected API routes and pages; users can view and edit their profile.

# Context
Specs: [GET /auth/me](../api/authentication.md#get-authme), [PATCH /users/me](../api/authentication.md#patch-usersme), optional [POST /users/me/password](../api/authentication.md#post-usersmepassword--mvp-inclusion-pending-d-07).

# Requirements
1. `middlewares/authenticate.ts`: verify the Bearer JWT and set `req.userId`, or return 401. It is the building block for every later protected route.
2. `GET /auth/me`, `PATCH /users/me`.
3. **Only if D-07 is approved:** `POST /users/me/password`, revoking the user's other families.
4. FE: `features/auth/queries.ts` (`useCurrentUser`), `routes/ProtectedRoute.tsx` (waits for session bootstrap, redirects to `/login?redirectTo=`), page `/settings/profile` (name, avatar URL, and the password form if D-07 is approved), and the app layout header showing the user.

# Out of Scope
Avatar upload (URL only); email change.

# Frontend Changes
`features/auth/queries.ts`, `routes/ProtectedRoute.tsx`, `pages/ProfilePage.tsx`, `components/layout/{AppLayout,Header}.tsx`.

# Backend Changes
`middlewares/authenticate.ts`, `modules/users/*` (routes/controller/service), `auth` me route.

# Database Changes
None.

# API Changes
`GET /api/v1/auth/me`, `PATCH /api/v1/users/me`, optionally `POST /api/v1/users/me/password`.

# Realtime Changes
None.

# Security Considerations
`authenticate` rejects expired, malformed, and wrong-signature tokens. `avatarUrl` must be https.

# Testing
Integration: 401 without/with a bad token, me success, profile validation. FE: ProtectedRoute redirect, profile form.

# Acceptance Criteria
- [ ] Unauthenticated visitors to `/settings/profile` are redirected to login and returned there afterwards.
- [ ] Profile changes persist.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
AUTH-002 (tokens exist). Can be built in parallel with AUTH-003/004; ProtectedRoute uses the AUTH-003 bootstrap once merged.

# Risks
Ordering with AUTH-003 on the FE → ProtectedRoute treats 'bootstrap pending' as loading, not as logged-out.
