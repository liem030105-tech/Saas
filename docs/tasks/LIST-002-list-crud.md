# LIST-002: Rename, archive, delete lists

| Field                | Value             |
| -------------------- | ----------------- |
| Phase                | 3 (MVP)           |
| Depends on           | LIST-001          |
| Blocked by decisions | none              |
| Skills               | backend, frontend |

# Goal

Members rename, archive, and delete lists.

# Context

Specs: [PATCH /lists/:listId](../api/lists.md#patch-listslistid) (`title`, `archived`), [DELETE /lists/:listId](../api/lists.md#delete-listslistid).

# Requirements

1. `PATCH /lists/:listId` for `title` and `archived` (logs `LIST_UPDATED` / `LIST_ARCHIVED`); `DELETE /lists/:listId` (cascade).
2. `ActivityType` += `LIST_UPDATED`, `LIST_ARCHIVED`; migration `add_list_activity_types`.
3. FE: inline title edit and a list menu (archive, delete with confirmation).

# Out of Scope

`position` changes (LIST-003).

# Frontend Changes

`features/lists/components/ListHeader.tsx`.

# Backend Changes

`lists` service and routes.

# Database Changes

Enum values only; migration `add_list_activity_types`.

# API Changes

`PATCH /api/v1/lists/:listId` (title, archived), `DELETE /api/v1/lists/:listId`.

# Realtime Changes

None (REALTIME-001).

# Security Considerations

The list resolves to its board → `assertBoardAccess(…, 'list.manage')`.

# Testing

Integration: role matrix, tenant isolation; archived lists are excluded from `findDetail`; delete cascades to cards (once cards exist, extended in CARD-001).

# Acceptance Criteria

- [ ] An archived list disappears from the board; a deleted list is gone after reload.

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies

LIST-001.

# Risks

None significant.
