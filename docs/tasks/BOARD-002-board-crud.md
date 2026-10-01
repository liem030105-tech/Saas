# BOARD-002: Board page, update, archive, delete

| Field                | Value                    |
| -------------------- | ------------------------ |
| Phase                | 3 (MVP)                  |
| Depends on           | BOARD-001, WORKSPACE-006 |
| Blocked by decisions | none                     |
| Skills               | backend, frontend        |

# Goal

Users open a board page; members rename, recolour, and archive boards; admins delete them.

# Context

Specs: [GET / PATCH / DELETE /boards/:boardId](../api/boards.md#get-boardsboardid).

# Requirements

1. `boards.repository.findDetail(boardId)` returns `BoardDetailDto` (lists and cards are empty until LIST-001/CARD-001; the shape is complete from day one).
2. `GET /boards/:boardId`, `PATCH` (logs `BOARD_UPDATED`), `DELETE` (≥ ADMIN).
3. FE page `/b/:boardId`: header with inline rename, colour, archive/unarchive, delete (ADMIN+), archived banner, board background. A non-visible board shows NotFound.
4. The workspace page gains an "Archived boards" toggle.
5. E2E scenario 6 (a VIEWER sees no create actions; a non-member opening a board URL sees NotFound).

# Out of Scope

Lists and cards.

# Frontend Changes

`pages/BoardPage.tsx`, `features/boards/components/BoardHeader.tsx`, `features/boards/queries.ts` (`['board', id]`).

# Backend Changes

`boards.repository.ts`, service and routes.

# Database Changes

None.

# API Changes

`GET|PATCH|DELETE /api/v1/boards/:boardId`.

# Realtime Changes

None (REALTIME-001).

# Security Considerations

Every route uses `assertBoardAccess`. DELETE requires ADMIN.

# Testing

Integration: role matrix + tenant isolation for the 3 routes; archive round trip. E2E scenario 6.

# Acceptance Criteria

- [ ] Board rename persists; MEMBER delete → 403; a non-member URL shows NotFound.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

BOARD-001; WORKSPACE-006 (isolation suite to extend).

# Risks

None significant.
