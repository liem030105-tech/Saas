# REALTIME-001: Realtime collaboration

| Field | Value |
|-------|-------|
| Phase | 5 (Post-MVP) |
| Depends on | All MVP tasks (Phases 0–4) |
| Blocked by decisions | none (D-16 has a default) |
| Skills | realtime, backend, frontend |

# Goal
Everyone viewing a board sees changes by others within about a second, without reloading.

# Context
Full contract: [architecture/realtime.md](../architecture/realtime.md). ADR-009.

May be delivered as sub-PRs, each meeting the DoD: 001a connection and rooms (requirement 1 without emitters, 3) → 001b emits (1–2; b1 boards, lists, members; b2 cards, comments) → 001c FE (4) → 001d E2E (5).

# Requirements
1. BE `realtime/socket.ts` (handshake authentication), `rooms.ts` (`board:join/leave`, `workspace:join/leave` with ack and authorization), `events/*.events.ts` for every event in the table.
2. Emit after commit from the existing services (boards, lists, cards, comments, workspaces.removeMember), including the rebalance events.
3. Shared: event name constants and `RealtimeEvent` payload types.
4. FE `lib/socket.ts` (connect with the access token; reconnect with a new token after refresh), `useBoardSocket`, `useWorkspaceSocket`; every FE synchronization rule in the table (own-event skip, dedupe LRU, stale version, reconnect invalidate, removed-member redirect).
5. E2E scenario 7.

# Out of Scope
The Redis adapter (only when multiple instances are deployed); attachment events (ATTACHMENTS-001).

# Frontend Changes
`lib/socket.ts`, `features/boards/hooks/useBoardSocket.ts`, `features/workspaces/hooks/useWorkspaceSocket.ts`.

# Backend Changes
`src/realtime/*`, emit calls in services, `server.ts` wiring.

# Database Changes
None.

# API Changes
None (REST unchanged).

# Realtime Changes
All rooms and events in [realtime.md → Events](../architecture/realtime.md#events).

# Security Considerations
Unauthenticated sockets are rejected; room join is authorized; removed members are evicted; payloads contain only data the room members may already see.

# Testing
Integration with `socket.io-client`: rejected handshake, rejected join, event received after a REST mutation, no event on a rolled-back transaction. FE hook tests: dedupe, stale, own-event skip, reconnect invalidate. E2E scenario 7.

# Acceptance Criteria
- [ ] Two browsers on the same board converge after concurrent edits, disconnects, and reconnects.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
MVP complete (every endpoint that emits exists).

# Risks
Event storms during rebalance → a single `*:reordered` event per rebalance.
