# CARD-004: Card drag and drop

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Depends on | CARD-003 |
| Blocked by decisions | none |
| Skills | frontend, testing |

# Goal
Users drag cards within and between lists with instant feedback that survives a reload.

# Context
FE rules: [frontend.md → Drag and drop](../architecture/frontend.md#drag-and-drop-with-optimistic-updates); API: [move](../api/cards.md#patch-cardscardidmove).

# Requirements
1. @dnd-kit sortable cards inside the list columns, with cross-container moves (pointer and keyboard sensors, screen-reader announcements).
2. `useMoveCard` mutation: compute the position with the shared position helpers → optimistic cache update of `['board', boardId]` → call move → replace with the server position → rollback on error with a toast → invalidate on settle.
3. Drag disabled for VIEWER.
4. E2E scenario 4.

# Out of Scope
Moving cards to another board via the UI (API supports it; the UI for it is backlog).

# Frontend Changes
`features/cards/hooks/useMoveCard.ts`, DnD wiring in the board page and list columns.

# Backend Changes
None.

# Database Changes
None.

# API Changes
None (consumes CARD-003).

# Realtime Changes
None.

# Security Considerations
The UI restriction for VIEWER is UX only; the server enforces it (CARD-003).

# Testing
Hook test: optimistic update, server-position reconciliation, rollback on 403/500. E2E scenario 4.

# Acceptance Criteria
- [ ] Dragging a card between lists persists after reload; a failed move snaps back with an error toast.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
CARD-003.

# Risks
DnD flakiness in E2E → use keyboard-driven moves in Playwright.
