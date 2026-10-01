# WORKSPACE-006: Tenant isolation suite

| Field                | Value            |
| -------------------- | ---------------- |
| Phase                | 2 (MVP)          |
| Depends on           | WORKSPACE-005    |
| Blocked by decisions | none             |
| Skills               | testing, backend |

# Goal

Automated proof that no endpoint leaks or mutates data across workspaces, plus a reusable pattern for later tasks.

# Context

Rules: [tenant isolation](../api/README.md#tenant-isolation-rules).

# Requirements

1. Fixture `tests/helpers/two-tenants.ts`: two users, each OWNER of their own workspace, plus sample data.
2. An integration suite asserting that user A gets 404 on every workspace-scoped endpoint of B's workspace, and that B's data is unchanged afterwards.
3. Document in `docs/development/testing.md` that every new endpoint adds itself to this suite (the non-member case).

# Out of Scope

Board/list/card endpoints (added by their tasks).

# Frontend Changes

None.

# Backend Changes

Test helpers only.

# Database Changes

None.

# API Changes

None.

# Realtime Changes

None.

# Security Considerations

This task is the security check for Phase 2.

# Testing

This task is the test.

# Acceptance Criteria

- [ ] The suite covers 100% of `/workspaces/*` and `/invites/*` endpoints.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

WORKSPACE-005.

# Risks

New endpoints forgetting to register → the review-checklist skill asks for it.
