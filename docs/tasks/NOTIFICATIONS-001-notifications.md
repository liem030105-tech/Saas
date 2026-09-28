# NOTIFICATIONS-001: In-app notifications

| Field | Value |
|-------|-------|
| Phase | 6 (Post-MVP) |
| Depends on | REALTIME-001 |
| Blocked by decisions | **D-09** (design), D-18 (email) |
| Skills | backend, database, frontend, realtime |

# Goal
Users are notified about events relevant to them (e.g. being assigned to a card).

# Context
Listed in the Phase 6 scope, but **no data model, API, or trigger list is specified yet**. This task first requires D-09 to be resolved and the spec written.

# Requirements
1. **Blocked until D-09 is resolved.** Before any code: write `docs/api/notifications.md` and add the `Notification` entity to `docs/database/schema.md`, via a docs-only PR approved by the owner.
2. Then implement exactly that spec.

# Out of Scope
Email delivery unless D-18 decides it; push notifications.

# Frontend Changes
Defined by the D-09 spec.

# Backend Changes
Defined by the D-09 spec.

# Database Changes
Defined by the D-09 spec (new `Notification` entity expected).

# API Changes
Defined by the D-09 spec.

# Realtime Changes
Likely a per-user room (e.g. `user:{userId}`) – must be added to realtime.md by the spec.

# Security Considerations
Notifications must only reference resources the recipient can still access (re-check on read).

# Testing
Defined by the spec; the baseline DoD applies.

# Acceptance Criteria
- [ ] Spec approved (docs PR) before implementation starts.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
REALTIME-001; decision D-09.

# Risks
Scope creep → keep the trigger list small in the D-09 spec.
