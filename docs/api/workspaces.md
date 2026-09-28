# API – Workspaces & Members

> **Domain:** `workspaces` module. Conventions and role matrix: [README](README.md).

| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| GET | `/workspaces` | Authenticated | → `200 WorkspaceDto[]` (only the caller's workspaces, with `role`) | – |
| POST | `/workspaces` | Authenticated | `CreateWorkspaceInput { name }` → `201 WorkspaceDto` | `VALIDATION_ERROR` |
| GET | `/workspaces/:id` | ≥ VIEWER | → `200 WorkspaceDto` | `NOT_FOUND` |
| PATCH | `/workspaces/:id` | ≥ ADMIN | `UpdateWorkspaceInput { name?, slug? }` → `200` | `FORBIDDEN`, `CONFLICT` (slug) |
| DELETE | `/workspaces/:id` | OWNER | → `204` | `FORBIDDEN` |
| GET | `/workspaces/:id/members` | ≥ VIEWER | → `200 MemberDto[]` | `NOT_FOUND` |
| PATCH | `/workspaces/:id/members/:userId` | ≥ ADMIN | `{ role }` → `200 MemberDto` | `FORBIDDEN`, `BUSINESS_RULE_VIOLATION` (last OWNER, granting a role above your own) |
| DELETE | `/workspaces/:id/members/:userId` | ≥ ADMIN, or self (leave) | → `204` | `BUSINESS_RULE_VIOLATION` |
| GET | `/workspaces/:id/invites` | ≥ ADMIN | → `200 InviteDto[]` | – |
| POST | `/workspaces/:id/invites` | ≥ ADMIN | `CreateInviteInput { email, role }` → `201 InviteDto` | `CONFLICT` (already a member), `PLAN_LIMIT_REACHED` |
| DELETE | `/workspaces/:id/invites/:inviteId` | ≥ ADMIN | → `204` | – |
| POST | `/invites/accept` | Authenticated | `{ token }` → `200 WorkspaceDto` | `NOT_FOUND` (invalid/expired token), `CONFLICT` |

## Service responsibilities
- `workspaces.service`:
  - `create`: unique slug; the creator becomes OWNER.
  - `update`, `remove`: edit and delete the workspace.
  - `changeRole`, `removeMember`: guarantee ≥ 1 OWNER; ADMIN cannot act on an OWNER.
  - `assertMember(userId, workspaceId, minRole)`: the **shared authorization entry point** used by every other module (backed by `workspaces.repository`).
- Invites:
  - Random token, only its hash is stored, expires after 7 days.
  - Email delivery: Phase 2 logs the link to the console; real email comes later.
  - Accepting requires the user's email to match the invite email; membership is created in a transaction.
- Plan limits (member count) are checked when creating and when accepting an invite.

## Required tests
- Role matrix for every route above (4 roles + non-member → 404).
- The last OWNER cannot be removed or demoted; an ADMIN cannot promote anyone to OWNER.
- Expired invite, email mismatch, accepting twice.
