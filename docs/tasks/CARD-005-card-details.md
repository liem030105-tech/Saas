# CARD-005: Card details (labels, members, checklists, comments, activity)

| Field | Value |
|-------|-------|
| Phase | 4 (MVP) |
| Depends on | CARD-002 |
| Blocked by decisions | none |
| Skills | backend, database, frontend |

# Goal
The card modal becomes complete: labels, assigned members, checklists, comments, and the activity feed.

# Context
Specs: [labels](../api/boards.md#labels-card-005), [card members & labels](../api/cards.md#card-members--labels-card-005), [checklists](../api/cards.md#checklists-card-005), [comments](../api/cards.md#comments-card-005-comments-module), [activities](../api/boards.md#get-boardsboardidactivities). May be delivered as sub-PRs 005a–005e in the order below, each meeting the DoD.

# Requirements
1. **005a Labels:** models `Label`, `CardLabel`; default labels on board creation plus a backfill migration; label CRUD; attach/detach (422, rule `LABEL_OTHER_BOARD`). Extend CARD-003's cross-board move to remove foreign labels, and add its test.
2. **005b Members:** model `CardMember`; assign/unassign (422, rule `NOT_WORKSPACE_MEMBER`); log `MEMBER_ADDED` / `MEMBER_REMOVED`; `workspaces.service.removeMember` deletes the removed user's card assignments in that workspace (I3).
3. **005c Checklists:** models `Checklist`, `ChecklistItem`; CRUD with positions (reuse the position helpers); progress `{ done, total }` in `CardSummaryDto`.
4. **005d Comments:** model `Comment` (`comments` module); paginated list, create (logs `COMMENT_ADDED`), author edit, author/ADMIN delete; `commentCount` in `CardSummaryDto`.
5. **005e Activity feed:** `GET /boards/:boardId/activities` with the `cardId` filter; activity section in the card modal and a board activity drawer.
6. `CardDetailDto` complete (except attachments). FE modal sections for each part; card items show label chips, member avatars, checklist and comment counts.
7. E2E scenario 5.

# Out of Scope
Attachments and covers (ATTACHMENTS-001), realtime (REALTIME-001), notifications.

# Frontend Changes
`features/cards/components/{LabelPicker,MemberPicker,ChecklistSection,ActivityFeed}.tsx`, `features/comments/*`, `features/boards/components/ActivityDrawer.tsx`.

# Backend Changes
`modules/cards/*` (labels, members, checklists), `modules/comments/*`, `modules/boards/*` (labels, activities), `workspaces.service.removeMember` hook.

# Database Changes
Models `Label`, `CardLabel`, `CardMember`, `Checklist`, `ChecklistItem`, `Comment`; `ActivityType` += `MEMBER_ADDED`, `MEMBER_REMOVED`, `COMMENT_ADDED`; migrations per sub-PR (`add_labels`, `add_card_members`, `add_checklists`, `add_comments`).

# API Changes
- 005a: `GET|POST /api/v1/boards/:boardId/labels`, `PATCH|DELETE /api/v1/labels/:labelId`, `POST|DELETE /api/v1/cards/:cardId/labels/:labelId`
- 005b: `POST|DELETE /api/v1/cards/:cardId/members/:userId`
- 005c: `POST /api/v1/cards/:cardId/checklists`, `PATCH|DELETE /api/v1/checklists/:checklistId`, `POST /api/v1/checklists/:checklistId/items`, `PATCH|DELETE /api/v1/checklists/:checklistId/items/:itemId`
- 005d: `GET|POST /api/v1/cards/:cardId/comments`, `PATCH|DELETE /api/v1/comments/:commentId`
- 005e: `GET /api/v1/boards/:boardId/activities`

# Realtime Changes
None (REALTIME-001).

# Security Considerations
Comment edit/delete ownership rules (matrix rows). Label and member foreign keys stay in the same board/workspace (tenant rule 4). Markdown comments are rendered sanitized.

# Testing
Integration per endpoint (5-case baseline + the cases listed in api docs); the role matrix and tenant-isolation suites extended. FE tests for pickers and comment ownership UI. E2E scenario 5.

# Acceptance Criteria
- [ ] A member can label, assign, add a checklist, and comment on a card; a VIEWER sees everything read-only; activity shows each action.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Phase 4 acceptance in plan.md holds → **MVP complete**
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
CARD-002 (modal). The cross-board label cleanup also touches CARD-003 code, so do that part after CARD-003 is merged.

# Risks
Size → split into 005a–005e; keep each PR under ~400 lines where possible.
