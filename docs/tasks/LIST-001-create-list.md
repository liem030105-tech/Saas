# LIST-001: Create lists (+ position helpers)

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Status | Todo |
| Depends on | BOARD-002 |
| Blocked by decisions | none |
| Skills | backend, database, frontend |

# Goal
Members add lists to a board; lists render in order.

# Context
Specs: [POST /boards/:boardId/lists](../api/lists.md#post-boardsboardidlists); ordering: [relationships.md → Ordering](../database/relationships.md#ordering-position).

# Requirements
1. Model `List`; `ActivityType` += `LIST_CREATED`; migration `add_lists`.
2. `src/lib/position.ts`: pure `initialPosition()`, `positionAfter(last)`, `positionBefore(first)`, `positionBetween(a, b)`, `needsRebalance(a, b)` with the constants from the spec.
3. `POST /boards/:boardId/lists` (appends when `position` is omitted; logs `LIST_CREATED`).
4. `findDetail` includes non-archived lists sorted by `position, id`.
5. FE: list columns on the board page (horizontal scroll) and an "Add list" composer. Position helpers are duplicated in `Trello-Clone-FE/src/lib/position.ts` (UI prediction only; the server stays authoritative).

# Out of Scope
Rename/archive/delete (LIST-002), reordering and rebalance (LIST-003).

# Frontend Changes
`features/lists/*`, `lib/position.ts`, `pages/BoardPage.tsx`.

# Backend Changes
`modules/lists/*`, `lib/position.ts`, `boards.repository.findDetail`.

# Database Changes
Model `List`; migration `add_lists`.

# API Changes
`POST /api/v1/boards/:boardId/lists`.

# Realtime Changes
None (REALTIME-001).

# Security Considerations
`assertBoardAccess(…, MEMBER)`. The `position` value is validated (finite, > 0).

# Testing
Unit: every position helper, including edge values. Integration: role matrix, tenant isolation, append ordering.

# Acceptance Criteria
- [ ] Adding three lists shows them in creation order after reload.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
BOARD-002 (board page and detail query).

# Risks
Float precision → covered by the rebalance in LIST-003.
