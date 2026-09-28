# LIST-003: List reordering and rebalance

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Depends on | LIST-001 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Members reorder lists by drag and drop; positions stay valid through rebalancing.

# Context
Ordering and rebalancing spec: [relationships.md](../database/relationships.md#rebalancing); API: `position` in [PATCH /lists/:listId](../api/lists.md#patch-listslistid).

# Requirements
1. `src/lib/rebalance.ts`: `rebalanceContainer(tx, table, containerColumn, containerId)` → locks rows `FOR UPDATE` and renumbers to `1024·n` by `position, id`. It is generic so CARD-003 reuses it for cards.
2. `PATCH /lists/:listId` accepts `position`; the update, threshold check, and optional rebalance run in one transaction; logs `LIST_MOVED` (`ActivityType` += `LIST_MOVED`).
3. The response returns the final position.
4. FE: horizontal drag of lists with @dnd-kit (pointer + keyboard sensors), optimistic cache update, rollback on error, invalidate on settle.

# Out of Scope
Card drag and drop (CARD-004).

# Frontend Changes
`features/lists/hooks/useMoveList.ts`, DnD wiring in `pages/BoardPage.tsx`.

# Backend Changes
`lib/rebalance.ts`, `lists.service.update` (position path).

# Database Changes
Enum value `LIST_MOVED`; migration `add_list_moved_type`.

# API Changes
`PATCH /api/v1/lists/:listId` (`position`).

# Realtime Changes
None (REALTIME-001 adds `list:moved`, `list:reordered`).

# Security Considerations
Position validation. The rebalance lock is scoped to one board's lists.

# Testing
- Unit: threshold detection.
- Integration: move to the start, between, and end; 60 repeated inserts into the same gap trigger a rebalance with the order preserved; role matrix.
- FE hook: optimistic update and rollback (MSW error).

# Acceptance Criteria
- [ ] Dragging lists persists the order after reload, including after forced rebalancing.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
LIST-001.

# Risks
Deadlocks under concurrent rebalances → a consistent lock order (single `FOR UPDATE` query sorted by id).
