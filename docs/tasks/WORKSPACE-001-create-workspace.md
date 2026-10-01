# WORKSPACE-001: Create and list workspaces

| Field | Value |
|-------|-------|
| Phase | 2 (MVP) |
| Depends on | AUTH-005 |
| Blocked by decisions | none (D-06 resolved: no workspace on registration, ADR-019) |
| Skills | backend, database, frontend |

# Goal
Signed-in users can create workspaces and see the workspaces they belong to.

# Context
Specs: [GET /workspaces](../api/workspaces.md#get-workspaces), [POST /workspaces](../api/workspaces.md#post-workspaces); data model: [schema.md → Workspace, WorkspaceMember](../database/schema.md#workspace--workspace-001).

# Requirements
1. Enums `Role`, `Plan`; models `Workspace`, `WorkspaceMember`; migration `add_workspaces`.
2. `workspaces` module with `workspaces.repository.ts` (membership queries) exposing `assertWorkspaceAccess(userId, workspaceId, minRole)`. It returns the member's role, throws `NOT_FOUND` for non-members and `FORBIDDEN` below `minRole`. Plus `middlewares/require-workspace-role.ts` for `/workspaces/:workspaceId/*` routes.
3. Slug generation: kebab-case of the name, then a random 4-char suffix on collision; retry on unique violation.
4. `GET /workspaces`, `POST /workspaces` (creator → OWNER, in one transaction).
5. Registration does **not** create a workspace (D-06, ADR-019).
6. Shared: `CreateWorkspaceInputSchema`, `WorkspaceDtoSchema`, `ROLE_ORDER` constant.
7. FE `features/workspaces`: queries (`['workspaces']`), a sidebar list, a create-workspace dialog, and route `/w/:slug` resolving the slug from the list (placeholder content; unknown slug → NotFound). After login, `/` redirects to the first workspace; a user with none sees a "Create your first workspace" screen (a form for the name) instead.

# Out of Scope
Rename/delete (WORKSPACE-002), members (WORKSPACE-003), invites (WORKSPACE-004), boards.

# Frontend Changes
`features/workspaces/*`, `components/layout/Sidebar.tsx`, `pages/WorkspacePage.tsx`, route updates.

# Backend Changes
`modules/workspaces/*`, `middlewares/require-workspace-role.ts`.

# Database Changes
Enums `Role`, `Plan`; models `Workspace`, `WorkspaceMember`; migration `add_workspaces`.

# API Changes
`GET /api/v1/workspaces`, `POST /api/v1/workspaces`.

# Realtime Changes
None.

# Security Considerations
Every endpoint checks membership via `assertWorkspaceAccess`; non-member → 404, insufficient role → 403 per the [permission matrix](../api/README.md#permission-matrix). `GET /workspaces` must never return workspaces the caller is not a member of.

# Testing
- Unit: slug generation; `assertWorkspaceAccess` role comparison.
- Integration: create → the caller is OWNER; list returns only own workspaces (a second user's workspace is absent); 400; 401.
- FE: create dialog validation; redirect to the first workspace; the first-workspace screen for a user with none.

# Acceptance Criteria
- [ ] A new user can create a workspace and lands on `/w/<slug>`.
- [ ] Another user never sees it.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
AUTH-005 (`authenticate`, ProtectedRoute).

# Risks
Slug race conditions → rely on the unique index plus retry.
