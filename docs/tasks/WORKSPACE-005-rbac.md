# WORKSPACE-005: RBAC consolidation

| Field                | Value                        |
| -------------------- | ---------------------------- |
| Phase                | 2 (MVP)                      |
| Depends on           | WORKSPACE-002, WORKSPACE-004 |
| Blocked by decisions | none                         |
| Skills               | backend, frontend, testing   |

# Goal

One authoritative server-side permission map, a reusable role-matrix test harness, and consistent role-aware UI.

# Context

The [permission matrix](../api/README.md#permission-matrix) is the spec. Later tasks (boards, lists, cards) reuse the harness and helpers created here.

# Requirements

1. BE `modules/workspaces/permissions.ts`: an action → minimum-role map covering every matrix row, used by services and by `requireWorkspaceRole`. Refactor W-001..004 to use it (in scope: same module).
2. BE test helper `tests/helpers/role-matrix.ts`: given an endpoint factory and the expected outcome per role (`OWNER|ADMIN|MEMBER|VIEWER|NON_MEMBER`), it creates the fixtures and asserts status codes.
3. FE `features/workspaces/hooks/useWorkspaceRole.ts` and a `can(role, action)` UI helper that reads a FE copy of the **visibility** rules. The FE copy is UX only; the BE map stays authoritative (no shared business logic).
4. Apply the harness to all existing workspace endpoints.

# Out of Scope

Board/list/card permissions (their tasks use the harness).

# Frontend Changes

`features/workspaces/hooks/useWorkspaceRole.ts`, `features/workspaces/permissions.ts` (UI visibility).

# Backend Changes

`modules/workspaces/permissions.ts`, `tests/helpers/role-matrix.ts`.

# Database Changes

None.

# API Changes

None (behavior unchanged).

# Realtime Changes

None.

# Security Considerations

The FE helper must never be imported by the BE or treated as security. The BE map covers every action.

# Testing

The role-matrix harness runs over all workspace endpoints; a unit test checks the permission map against the matrix table.

# Acceptance Criteria

- [ ] All workspace endpoints pass the matrix; the UI hides actions the role cannot perform.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

WORKSPACE-002, WORKSPACE-004 (all workspace endpoints exist).

# Risks

Drift between FE visibility and the BE map → a unit test compares both against a fixture of matrix rows.
