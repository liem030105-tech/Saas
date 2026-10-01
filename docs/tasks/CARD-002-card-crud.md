# CARD-002: Card modal, update, archive, delete

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Depends on | CARD-001 |
| Blocked by decisions | none |
| Skills | backend, frontend |

# Goal
Users open a card in a modal; members edit title, description, due date, and completion, and archive or delete cards.

# Context
Specs: [GET /cards/:cardId](../api/cards.md#get-cardscardid), [PATCH /cards/:cardId](../api/cards.md#patch-cardscardid), [DELETE /cards/:cardId](../api/cards.md#delete-cardscardid).

# Requirements
1. `GET`, `PATCH` (logs `CARD_UPDATED` / `CARD_ARCHIVED`), `DELETE`. `ActivityType` += `CARD_UPDATED`, `CARD_ARCHIVED`.
2. FE modal route `/b/:boardId/c/:cardId` (shareable URL): inline title, markdown description editor and preview (sanitized render), due-date picker, completed checkbox, archive, delete with confirmation. A card that is not visible shows NotFound.
3. Card items show the due-date badge and completed state.

# Out of Scope
Members, labels, checklists, comments, activity (CARD-005); moving (CARD-003).

# Frontend Changes
`features/cards/components/CardDetailModal.tsx`, `components/ui/Markdown.tsx` (sanitized), route.

# Backend Changes
`cards` service and routes.

# Database Changes
Enum values; migration `add_card_activity_types`.

# API Changes
`GET|PATCH|DELETE /api/v1/cards/:cardId`.

# Realtime Changes
None (REALTIME-001).

# Security Considerations
Markdown is rendered only through the sanitized component (XSS). `assertBoardAccess` via the card's `boardId`.

# Testing
Integration: role matrix, tenant isolation, validation (title length, dueDate format). FE: the Markdown component strips `<script>`; modal edit flow.

# Acceptance Criteria
- [ ] Opening a shared card URL shows the card to members and NotFound to others.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
CARD-001.

# Risks
XSS via markdown → covered by the component test.
