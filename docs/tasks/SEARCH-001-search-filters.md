# SEARCH-001: Card search and filters

| Field | Value |
|-------|-------|
| Phase | 6 (Post-MVP) |
| Depends on | REALTIME-001 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Users find cards on a board by text, label, member, and due date.

# Context
Spec: [GET /boards/:boardId/search](../api/boards.md#search-post-mvp-search-001).

# Requirements
1. `GET /boards/:boardId/search` with `q` (`ILIKE` on title and description), `labelId`, `memberId`, `due` filters; max 100 results (D-14).
2. FE: a board toolbar with a search box and filter menu; filter state in a Zustand UI store; results highlight the matching cards on the board (non-matching are dimmed).

# Out of Scope
Cross-board or workspace-wide search; full-text ranking (`pg_trgm` only if needed, as a separate change).

# Frontend Changes
`features/boards/components/BoardFilterBar.tsx`, `features/boards/store.ts`.

# Backend Changes
`boards.repository.search`.

# Database Changes
None (add an index only if profiling shows the need).

# API Changes
`GET /api/v1/boards/:boardId/search`.

# Realtime Changes
None (results are recomputed from the cache after events).

# Security Considerations
Scoped to one board via `assertBoardAccess`; parameterized `ILIKE` (escape `%` and `_`).

# Testing
Integration: each filter, combined filters, wildcard escaping, role matrix, tenant isolation.

# Acceptance Criteria
- [ ] Filtering by label and text shows only matching cards; clearing restores the board.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
REALTIME-001 (recommended order; no hard code dependency).

# Risks
Slow `ILIKE` on large boards → acceptable at demo scale.
