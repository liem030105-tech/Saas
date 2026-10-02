# NOTIFICATIONS-001: In-app notifications

| Field | Value |
|-------|-------|
| Phase | 6 (Post-MVP) |
| Depends on | REALTIME-001 |
| Blocked by decisions | none (D-09 resolved: in-app only, ADR-021); D-18 (email) not needed |
| Skills | backend, database, frontend, realtime |

# Goal
Users are notified about events relevant to them (e.g. being assigned to a card).

# Context
Delivery and triggers are decided ([ADR-021](../decisions/README.md#adr-021-in-app-notifications-only-d-09)): in-app only; assigned to a card, a comment on a card you are a member of (or mentioning you), a card you are a member of coming due, a workspace invite for an existing account. The data model and API are written first (requirement 1).

# Requirements
1. Before any code: write `docs/api/notifications.md` and add the `Notification` entity to `docs/database/schema.md`, via a docs-only PR approved by the owner.
2. Then implement exactly that spec.

# Out of Scope
Email delivery (ADR-021); push notifications.

# Frontend Changes
Defined by the spec PR (requirement 1).

# Backend Changes
Defined by the spec PR (requirement 1).

# Database Changes
Defined by the spec PR (requirement 1) (new `Notification` entity expected).

# API Changes
Defined by the spec PR (requirement 1).

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
REALTIME-001; ADR-021 (D-09).

# Risks
Scope creep → keep to ADR-021's trigger list.
