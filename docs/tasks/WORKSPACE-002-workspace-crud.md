# WORKSPACE-002: View, rename, and delete a workspace

| Field | Value |
|-------|-------|
| Phase | 2 (MVP) |
| Depends on | WORKSPACE-001 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Admins can rename a workspace or change its slug; the owner can delete it.

# Context
Specs: [GET / PATCH / DELETE /workspaces/:workspaceId](../api/workspaces.md#get-workspacesworkspaceid).

# Requirements
1. `GET`, `PATCH` (≥ ADMIN, 409 on slug conflict), `DELETE` (OWNER, cascade).
2. Shared `UpdateWorkspaceInputSchema`.
3. FE page `/w/:slug/settings`: rename, slug edit (navigates to the new slug), delete with a typed-name confirmation. Actions the caller's role cannot perform are hidden.

# Out of Scope
Billing settings (BILLING-001).

# Frontend Changes
`pages/WorkspaceSettingsPage.tsx`, `features/workspaces/components/*`.

# Backend Changes
`workspaces` routes/controller/service additions.

# Database Changes
None.

# API Changes
`GET|PATCH|DELETE /api/v1/workspaces/:workspaceId`.

# Realtime Changes
None.

# Security Considerations
Every endpoint checks membership via `assertWorkspaceAccess`; non-member → 404, insufficient role → 403 per the [permission matrix](../api/README.md#permission-matrix).

# Testing
Integration: 5-case baseline for each route; slug conflict → 409; delete cascades to members.

# Acceptance Criteria
- [ ] ADMIN can rename; MEMBER gets 403; OWNER can delete, and the workspace disappears from every member's list.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
WORKSPACE-001.

# Risks
Slug change breaks open tabs → FE redirects on a 404 for the old slug to `/`.
