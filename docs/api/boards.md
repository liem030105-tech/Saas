# API – Boards, Labels, Activity

> **Domain:** `boards` module (board labels and the activity feed live here). Conventions, errors, validation, permission matrix: [README](README.md).

**Shared shapes**
- `BoardDto = { id, workspaceId, title, background, archived, createdAt, updatedAt }`
- `BoardDetailDto = BoardDto & { lists: ListDto[], labels: LabelDto[] }` where each `ListDto` contains `cards: CardSummaryDto[]`. Only non-archived lists and cards, sorted by `position ASC, id ASC`.
- `CardSummaryDto = { id, listId, title, position, dueDate, completed, coverUrl (a signed URL of the cover image, or null; ATTACHMENTS-001), labelIds: string[], memberIds: string[], checklist: { done, total }, commentCount }`. `labelIds` (by id) since CARD-005a, `memberIds` (by id) since CARD-005b, and `checklist` (done and total items over all the card's checklists) since CARD-005c; `commentCount` (the card's comments) since CARD-005d.
- `LabelDto = { id, boardId, name, color }`
- `ActivityDto = { id, type, data, createdAt, cardId, user: { id, name, avatarUrl } }`

---

### GET /workspaces/:workspaceId/boards
| | |
|--|--|
| Task | BOARD-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER |
| Query | `archived` = `false` (default) \| `true`: open or archived boards only |
| Success | `200 { data: BoardDto[] }`, ordered by `createdAt DESC` (then `id DESC`) |
| Errors | `400` (invalid `archived`) · `401` · `404` · `429 RATE_LIMITED` |

### POST /workspaces/:workspaceId/boards
| | |
|--|--|
| Task | BOARD-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER |
| Body | `{ title, background? }` (`background` defaults to `#0079bf`) |
| Success | `201 { data: BoardDto }` · logs `BOARD_CREATED` with `data: { title }`, in the same transaction |
| Errors | `400` · `401` · `403` · `404` · `402 PLAN_LIMIT_REACHED` (the plan's board limit, [billing.md](billing.md#plans-and-limits)) · `429 RATE_LIMITED` |

Schemas: `CreateBoardInputSchema`, `ListBoardsQuerySchema`, `BoardDtoSchema`; activity types: `ACTIVITY_TYPES` (`@trello-clone/shared`). Board-scoped endpoints (BOARD-002 onwards) authorize through `assertBoardAccess(userId, boardId, action)` in the boards service.

### GET /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER (`assertBoardAccess(…, 'board.view')`) |
| Success | `200 { data: BoardDetailDto }`. Loaded with one query via `boards.repository.findDetail` after the access check; non-archived lists (LIST-001), each with its non-archived cards (CARD-001); each card's `labelIds` (by id), and the board's `labels` in creation order (CARD-005) |
| Errors | `401` · `404` (unknown board, malformed id, or not a member) · `429 RATE_LIMITED` |

Archived boards remain viewable; the FE shows an "archived" banner.

### PATCH /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (`'board.edit'`: rename, recolour, archive/unarchive) |
| Body | `{ title?, background?, archived? }`, at least one |
| Success | `200 { data: BoardDto }` · logs `BOARD_UPDATED` with the changed fields as `data`, in the same transaction |
| Errors | `400` · `401` · `403` · `404` · `429 RATE_LIMITED` |

### DELETE /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN (`'board.delete'`) |
| Success | `204` (cascade: lists, cards, labels and the activity log go with it; the cards' attachment files are deleted from storage after commit, ATTACHMENTS-001) |
| Errors | `401` · `403` · `404` · `429 RATE_LIMITED` |

Schemas: `UpdateBoardInputSchema`, `BoardDetailDtoSchema`, `ListDtoSchema`, `CardSummaryDtoSchema`, `LabelDtoSchema` (`@trello-clone/shared`).

### GET /boards/:boardId/activities
| | |
|--|--|
| Task | CARD-005 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER (`assertBoardAccess(…, 'board.view')`) |
| Query | `limit`, `cursor` ([pagination](README.md#pagination)), optional `cardId` (filters to one card, which must belong to this board, else `404`) |
| Success | `200 { data: ActivityDto[], nextCursor }` |
| Errors | `400` (invalid `limit`, `cursor` or `cardId`; a cursor outside this feed) · `401` · `404` (unknown board, not a member, or `cardId` not on this board) · `429 RATE_LIMITED` |

Since CARD-005e. Only the entries the workspace's plan still shows: on Free, the last 7 days (activity retention, [billing.md](billing.md#plans-and-limits)); older entries are hidden, not deleted, and are not cursors of the feed. Newest first by `createdAt, id`; `cursor` is the id of the last entry of the previous page and must be an entry of the feed asked for (this board, and this card when `cardId` is given), else `400 VALIDATION_ERROR` (`path: "cursor"`), the same for a foreign id and one nothing has. `cardId` must be a card on this board now: a card that moved here shows only the entries logged on this board (its `CARD_MOVED` included). `data` is the event's details as logged (e.g. `CARD_MOVED`: `fromListId`, `toListId`, `fromBoardId`, `toBoardId`; `CARD_UPDATED`: the changed fields, `description: true` for a new description); clients ignore fields they do not know. Schemas: `ListActivitiesQuerySchema`, `ActivityDtoSchema`, `ActivitiesPageSchema` (`@trello-clone/shared`).

## Labels (CARD-005)

Creating a board also creates 6 default labels (`#61bd4f` `#f2d600` `#ff9f1a` `#eb5a46` `#c377e0` `#0079bf`; empty names). The `add_labels` migration backfilled them for boards created before CARD-005. Labels are listed in creation order (by id). A label resolves to its stored board: an unknown or malformed `:labelId` and a label the caller cannot see are the same `404`. Label changes log nothing. Schemas: `CreateLabelInputSchema`, `UpdateLabelInputSchema`, `LabelDtoSchema` (`@trello-clone/shared`).

| Method | Path | Authorization | Body → Success | Errors |
|--------|------|---------------|----------------|--------|
| GET | `/boards/:boardId/labels` | ≥ VIEWER | → `200 { data: LabelDto[] }` | `404` |
| POST | `/boards/:boardId/labels` | ≥ MEMBER | `{ name?, color }` → `201 { data: LabelDto }` | `400` `403` `404` |
| PATCH | `/labels/:labelId` | ≥ MEMBER | `{ name?, color? }` → `200 { data: LabelDto }` | `400` `403` `404` |
| DELETE | `/labels/:labelId` | ≥ MEMBER | → `204` (detaches from cards) | `403` `404` |

## Search (Post-MVP, SEARCH-001)
| Method | Path | Authorization | Query → Success |
|--------|------|---------------|-----------------|
| GET | `/boards/:boardId/search` | ≥ VIEWER | `q?` (1–100 chars), `labelId?`, `memberId?`, `due?` = `overdue` \| `week` \| `none` → `200 { data: CardSummaryDto[] }` (max 100 per D-14, non-archived) |

- Finds the board's open cards in open lists (archived cards and cards in archived lists never match), in board order (list position, then card position), at most 100. Every given filter must match; none given lists them all.
- `q` matches the title or the description, case-insensitively, as typed: `%`, `_` and `\` are plain characters, not wildcards (escaped before the `ILIKE`).
- `labelId` / `memberId`: cards with that label / that member. An id that is not on this board (or another workspace's) simply matches nothing.
- `due` (D-26): `overdue` = due date passed and not completed; `week` = due within the next 7 days and not completed; `none` = no due date.
- Errors: `400` (invalid filter), `401`, `404` (unknown board or not a member).

## Realtime (Post-MVP, REALTIME-001)
Board create/update/delete emit `board:created|updated|deleted` to `workspace:{workspaceId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Role matrix: VIEWER create → 403, MEMBER delete → 403, non-member → 404 on every route.
- `GET /boards/:boardId` returns correct ordering and excludes archived lists and cards.
- Archive/unarchive round trip. The listing respects `archived`.
- Activity pagination and the `cardId` filter, including a card from another board → 404.
