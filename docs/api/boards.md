# API – Boards & Labels

> **Domain:** `boards` module (including board labels and activity). Conventions: [README](README.md).

| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| GET | `/workspaces/:id/boards` | ≥ VIEWER | `?archived=false` → `200 BoardSummaryDto[]` | `NOT_FOUND` |
| POST | `/workspaces/:id/boards` | ≥ MEMBER | `CreateBoardInput { title, background? }` → `201 BoardDto` | `PLAN_LIMIT_REACHED`, `FORBIDDEN` |
| GET | `/boards/:id` | ≥ VIEWER | → `200 BoardDetailDto` (board + lists + card summaries + labels, excluding archived) | `NOT_FOUND` |
| PATCH | `/boards/:id` | ≥ MEMBER | `UpdateBoardInput { title?, background?, archived? }` → `200 BoardDto` | `FORBIDDEN` |
| DELETE | `/boards/:id` | ≥ ADMIN | → `204` | `FORBIDDEN` |
| GET | `/boards/:id/activities` | ≥ VIEWER | `?limit&cursor` → `200 ActivityDto[] + nextCursor` | – |
| GET | `/boards/:id/labels` | ≥ VIEWER | → `200 LabelDto[]` | – |
| POST | `/boards/:id/labels` | ≥ MEMBER | `CreateLabelInput { name, color }` → `201 LabelDto` | – |
| PATCH | `/labels/:id` | ≥ MEMBER | `{ name?, color? }` → `200` | – |
| DELETE | `/labels/:id` | ≥ MEMBER | → `204` | – |
| GET | `/boards/:id/search` | ≥ VIEWER | `?q&labelId&memberId&due` → `200 CardSummaryDto[]` (Phase 6) | – |

## Service responsibilities
- `boards.service`:
  - `create`: check plan limit (Free: 5 boards), create 6 default labels, log `BOARD_CREATED`, emit `board:created` to `workspace:<id>`.
  - `getDetail`: uses `boards.repository.findDetail` – one query with selective `include`.
  - `update`, `archive`, `remove`: emit `board:updated` / `board:deleted`.
- Favorites (starring) are stored client-side in the MVP; a `BoardStar` model can be added later.

## Required tests
- Non-member → 404; VIEWER creating a board → 403; MEMBER deleting a board → 403.
- Creating a 6th board on Free → 402.
- `getDetail` returns lists/cards ordered by `position` and excludes archived items.
