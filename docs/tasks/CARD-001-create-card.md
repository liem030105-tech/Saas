# CARD-001: Create cards

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Depends on | LIST-001 |
| Blocked by decisions | none |
| Skills | backend, database, frontend |

# Goal
Members add cards to lists; cards render in order inside their list.

# Context
Specs: [POST /lists/:listId/cards](../api/cards.md#post-listslistidcards); model: [Card](../database/schema.md#card--card-001); invariant I1.

# Requirements
1. Model `Card`; add `Activity.cardId` (nullable, SetNull) and its index; `ActivityType` += `CARD_CREATED`; migration `add_cards`.
2. `POST /lists/:listId/cards`: `boardId` is copied from the list; appended when `position` is omitted; logs `CARD_CREATED` with `cardId`.
3. `findDetail` includes non-archived cards per list as `CardSummaryDto` (fields owned by CARD-005 are returned empty or zero).
4. Shared `CreateCardInputSchema`, `CardSummaryDtoSchema`.
5. FE: card items inside list columns and an "Add a card" composer at the bottom of each list.
6. E2E scenario 3 (board → list → card).

# Out of Scope
The card modal (CARD-002), moving (CARD-003/004), details (CARD-005).

# Frontend Changes
`features/cards/{api,queries}.ts`, `features/cards/components/{CardItem,AddCardComposer}.tsx`.

# Backend Changes
`modules/cards/*` (create), `boards.repository.findDetail`.

# Database Changes
Model `Card`; `Activity.cardId`; migration `add_cards`.

# API Changes
`POST /api/v1/lists/:listId/cards`.

# Realtime Changes
None (REALTIME-001).

# Security Considerations
The list resolves to its board → `assertBoardAccess(…, MEMBER)`. `boardId` is never taken from the client.

# Testing
Integration: role matrix, tenant isolation, append order, `boardId` equals `list.boardId`. Extend the LIST-002 cascade test to cards. E2E scenario 3.

# Acceptance Criteria
- [ ] Cards appear in creation order and persist after reload.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
LIST-001.

# Risks
None significant.
