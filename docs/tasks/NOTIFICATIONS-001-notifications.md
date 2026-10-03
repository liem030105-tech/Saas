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

# Spec (requirement 1)
[api/notifications.md](../api/notifications.md) (endpoints, triggers, visibility, FE), [schema.md → Notification](../database/schema.md#notification--notifications-001), [realtime.md](../architecture/realtime.md) (`notification:created`, `notification:read` in `user:{userId}`), `POST /invites/:inviteId/accept` in [workspaces.md](../api/workspaces.md). Approved by the owner, with D-28 (mention syntax: (a), the `@` picker) and D-29 (24 hours) resolved.

Delivery in sub-PRs, each meeting the DoD: **001a** model, migration `add_notifications`, the four endpoints and accept-by-id; **001b** the triggers (assign, comment, invite, due soon) and the live events; **001c** FE (bell, popover, socket); **001d** mentions (D-28: the composer's `@` picker, mention chips in `Markdown`, `CARD_MENTIONED`).

# Frontend Changes
`features/notifications` (bell in the top bar, popover list, `useNotificationsSocket`); per the spec.

# Backend Changes
`modules/notifications` (routes, controller, service), triggers in the cards, comments and workspaces services, `realtime/events/notifications.events.ts`; per the spec.

# Database Changes
Model `Notification`, enum `NotificationType`; migration `add_notifications`.

# API Changes
`GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/:notificationId`, `POST /api/v1/notifications/read-all`, `POST /api/v1/invites/:inviteId/accept`.

# Realtime Changes
`notification:created`, `notification:read` in the existing `user:{userId}` room.

# Security Considerations
Notifications must only reference resources the recipient can still access (re-check on read).

# Testing
Defined by the spec; the baseline DoD applies.

# Acceptance Criteria
- [x] Spec approved (docs PR) before implementation starts.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
REALTIME-001; ADR-021 (D-09).

# Risks
Scope creep → keep to ADR-021's trigger list.
