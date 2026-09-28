# WORKSPACE-004: Invitations

| Field | Value |
|-------|-------|
| Phase | 2 (MVP) |
| Status | Todo |
| Depends on | WORKSPACE-003 |
| Blocked by decisions | none (D-17 and D-18 have defaults) |
| Skills | backend, database, frontend |

# Goal
Admins invite people by email and share an invite link; the invited user accepts it and joins.

# Context
Specs: [invitations](../api/workspaces.md#invitations); model: [WorkspaceInvite](../database/schema.md#workspaceinvite--workspace-004); no email delivery in MVP (D-18).

# Requirements
1. `WorkspaceInvite` model; migration `add_workspace_invites`.
2. Create (the returned `inviteUrl` contains the raw token, returned only once), list pending, revoke, accept.
3. Expiry D-17. Re-inviting the same email replaces the pending invite. The invite role is ≤ the caller's role and never OWNER.
4. Accept: the email must match, membership is created, `acceptedAt` is set, all in one transaction.
5. FE: invite dialog on the members page (copy-link button), pending invites list with revoke, and page `/invite/:token` (requires login, then calls accept and redirects to the workspace; on failure shows a generic "invite invalid or expired").
6. E2E scenario 2.

# Out of Scope
Sending email (D-18); plan limits (BILLING-001).

# Frontend Changes
`features/workspaces/components/InviteDialog.tsx`, `pages/AcceptInvitePage.tsx`.

# Backend Changes
`workspaces/invites.*` (inside the workspaces module).

# Database Changes
Model `WorkspaceInvite`; migration `add_workspace_invites`.

# API Changes
`GET|POST /api/v1/workspaces/:workspaceId/invites`, `DELETE /api/v1/workspaces/:workspaceId/invites/:inviteId`, `POST /api/v1/invites/accept`.

# Realtime Changes
None.

# Security Considerations
Every endpoint checks membership via `assertWorkspaceAccess`; non-member → 404, insufficient role → 403 per the [permission matrix](../api/README.md#permission-matrix). Store only the token hash. Accept errors are indistinguishable (404). Never log raw tokens.

# Testing
Integration: role matrix; expired; email mismatch; accept twice; re-invite replaces; role cap. E2E scenario 2.

# Acceptance Criteria
- [ ] A second user can join via the link with the invited role; the link cannot be reused.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
WORKSPACE-003 (members page and rules).

# Risks
Leaked links → short expiry, email match required.
