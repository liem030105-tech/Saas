# WORKSPACE-003: Members management

| Field                | Value             |
| -------------------- | ----------------- |
| Phase                | 2 (MVP)           |
| Depends on           | WORKSPACE-001     |
| Blocked by decisions | none              |
| Skills               | backend, frontend |

# Goal

Workspace members are visible, and admins can change roles and remove members; anyone can leave.

# Context

Specs: [members endpoints](../api/workspaces.md#members); rules: [permission matrix footnotes 1–3](../api/README.md#permission-matrix); invariant I4 in [relationships.md](../database/relationships.md#invariants-enforced-by-services).

# Requirements

1. `GET /workspaces/:workspaceId/members`, `PATCH …/members/:userId`, `DELETE …/members/:userId` (including self-leave).
2. Rules: `LAST_OWNER` (422); only an OWNER grants OWNER; an ADMIN cannot act on OWNERs and assigns ≤ ADMIN.
3. Removing a member also removes their `CardMember` rows in this workspace. That table arrives in CARD-005, so this step is a no-op until then, and CARD-005 adds it (tracked there).
4. FE page `/w/:slug/members`: list, role dropdown, remove, and "Leave workspace", all role-aware.

# Out of Scope

Inviting new members (WORKSPACE-004).

# Frontend Changes

`pages/WorkspaceMembersPage.tsx`, `features/workspaces/components/MemberRow.tsx`.

# Backend Changes

`workspaces.service.{listMembers,changeRole,removeMember}`.

# Database Changes

None.

# API Changes

`GET /api/v1/workspaces/:workspaceId/members`, `PATCH|DELETE /api/v1/workspaces/:workspaceId/members/:userId`.

# Realtime Changes

None.

# Security Considerations

Every endpoint checks membership via `assertWorkspaceAccess`; non-member → 404, insufficient role → 403 per the [permission matrix](../api/README.md#permission-matrix). Role escalation is the main risk: enforce the footnote rules server-side.

# Testing

Integration: the full role matrix; `LAST_OWNER` for demote, remove, and leave; ADMIN → OWNER target 403; ADMIN granting OWNER 403.

# Acceptance Criteria

- [ ] No sequence of API calls leaves a workspace without an OWNER or lets an ADMIN gain OWNER.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

WORKSPACE-001.

# Risks

Concurrent demotion of two owners → run the owner-count check and the update in one transaction with `FOR UPDATE` on the workspace's OWNER rows.
