# BOARD-001: Create and list boards (+ activity foundation)

| Field | Value |
|-------|-------|
| Phase | 3 (MVP) |
| Depends on | WORKSPACE-005 |
| Blocked by decisions | none |
| Skills | backend, database, frontend |

# Goal
Members create boards in a workspace and see the workspace's boards. The activity log infrastructure exists from here on.

# Context
Specs: [boards](../api/boards.md#get-workspacesworkspaceidboards); models [Board](../database/schema.md#board--board-001), [Activity](../database/schema.md#activity--board-001-cardid-added-in-card-001). Plan limits are **not** enforced (D-11).

# Requirements
1. Models `Board`, `Activity` (without `cardId`), enum `ActivityType` (`BOARD_CREATED`, `BOARD_UPDATED`); migration `add_boards_activity`.
2. `boards` module: `assertBoardAccess(userId, boardId, minRole)` (one query joining the workspace membership) and `boards/activity.ts` with `logActivity(tx, { boardId, userId, type, data, cardId? })`.
3. `GET /workspaces/:workspaceId/boards` (`archived` filter), `POST /workspaces/:workspaceId/boards` (logs `BOARD_CREATED`).
4. Shared: `CreateBoardInputSchema`, `BoardDtoSchema`, the `ActivityType` constant.
5. FE: the boards grid on `/w/:slug` with a create-board dialog (title + colour picker from a fixed palette); tiles link to `/b/:boardId`. The create button is hidden for VIEWER.
6. Add the endpoints to the role-matrix and tenant-isolation suites.

# Out of Scope
Board page contents (BOARD-002), labels (CARD-005), plan limits, realtime.

# Frontend Changes
`features/boards/*`, `pages/WorkspacePage.tsx` (grid).

# Backend Changes
`modules/boards/*` (routes, controller, service, `activity.ts`).

# Database Changes
`Board`, `Activity`, enum `ActivityType`; migration `add_boards_activity`.

# API Changes
`GET|POST /api/v1/workspaces/:workspaceId/boards`.

# Realtime Changes
None (REALTIME-001 adds `board:created`).

# Security Considerations
VIEWER cannot create. `assertBoardAccess` becomes the single entry point for all board-scoped authorization in later tasks.

# Testing
Integration: role matrix, tenant isolation, archived filter, activity row written. FE: dialog validation.

# Acceptance Criteria
- [ ] A MEMBER creates a board and sees it in the grid; a VIEWER sees the grid without the create button.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
WORKSPACE-005 (permission map and harness).

# Risks
None significant.
