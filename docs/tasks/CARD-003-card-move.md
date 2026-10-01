# CARD-003: Card move API

| Field                | Value              |
| -------------------- | ------------------ |
| Phase                | 3 (MVP)            |
| Depends on           | CARD-002, LIST-003 |
| Blocked by decisions | none               |
| Skills               | backend            |

# Goal

A single endpoint that moves a card within a list, across lists, or across boards in the same workspace, safely and atomically.

# Context

Contract: [PATCH /cards/:cardId/move](../api/cards.md#patch-cardscardidmove); ordering and concurrency: [relationships.md](../database/relationships.md#ordering-position); invariants I1, I2, I6.

# Requirements

1. `cards.repository.move` implements the six-step transaction exactly as specified, reusing `lib/rebalance.ts` (LIST-003) with the card table.
2. `422 BUSINESS_RULE_VIOLATION` (rule `CROSS_WORKSPACE_MOVE`) when the target list is visible to the caller but in another workspace; `404` when it is not visible.
3. `ActivityType` += `CARD_MOVED`; `data = { fromListId, toListId, fromBoardId, toBoardId }`.
4. Shared `MoveCardInputSchema`, `MoveCardResultSchema`.

# Out of Scope

FE drag and drop (CARD-004); realtime emits (REALTIME-001).

# Frontend Changes

None (`features/cards/api.ts` gets `moveCard` in CARD-004).

# Backend Changes

`cards.repository.ts` (move), `cards.service.move`, route.

# Database Changes

Enum value `CARD_MOVED`; migration `add_card_moved_type`.

# API Changes

`PATCH /api/v1/cards/:cardId/move`.

# Realtime Changes

None (REALTIME-001 adds `card:moved`, `card:reordered`).

# Security Considerations

Both the card and the target list are authorized; no client `boardId`; cross-workspace moves are rejected (I6).

# Testing

- Integration: move within a list, across lists, across boards (`boardId` updated, foreign labels removed once labels exist – add that case in CARD-005), to an invisible list → 404 and data unchanged, cross-workspace → 422, invalid positions → 400, rebalance under repeated same-gap moves, role matrix, tenant isolation.
- A concurrency test: two parallel moves into the same list both succeed and the final order is deterministic.

# Acceptance Criteria

- [ ] All integration cases pass; card order after any sequence of moves equals the order from `findDetail`.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

CARD-002 (card module), LIST-003 (rebalance helper).

# Risks

Lock contention on hot lists → acceptable at demo scale; the rebalance is rare.
