# API – Boards, Labels, Activity

> **Domain:** `boards` module (board labels and the activity feed live here). Conventions, errors, validation, permission matrix: [README](README.md).

**Shared shapes**
- `BoardDto = { id, workspaceId, title, background, archived, createdAt, updatedAt }`
- `BoardDetailDto = BoardDto & { lists: ListDto[], labels: LabelDto[] }` where each `ListDto` contains `cards: CardSummaryDto[]`. Only non-archived lists and cards, sorted by `position ASC, id ASC`.
- `CardSummaryDto = { id, listId, title, position, dueDate, completed, coverUrl, labelIds: string[], memberIds: string[], checklist: { done, total }, commentCount }`. Fields owned by CARD-005 are empty or zero until that task lands.
- `LabelDto = { id, boardId, name, color }`
- `ActivityDto = { id, type, data, createdAt, cardId, user: { id, name, avatarUrl } }`

---

### GET /workspaces/:workspaceId/boards
| | |
|--|--|
| Task | BOARD-001 |
| Authorization | ≥ VIEWER |
| Query | `archived` = `false` (default) \| `true` |
| Success | `200 { data: BoardDto[] }`, ordered by `createdAt DESC` |
| Errors | `401` · `404` |

### POST /workspaces/:workspaceId/boards
| | |
|--|--|
| Task | BOARD-001 |
| Authorization | ≥ MEMBER |
| Body | `{ title, background? }` |
| Success | `201 { data: BoardDto }` · logs `BOARD_CREATED` |
| Errors | `400` · `401` · `403` · `404` · `402` (from BILLING-001 only, D-11) |

### GET /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authorization | ≥ VIEWER |
| Success | `200 { data: BoardDetailDto }`. Loaded with one query via `boards.repository.findDetail` |
| Errors | `401` · `404` |

Archived boards remain viewable; the FE shows an "archived" banner.

### PATCH /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authorization | ≥ MEMBER |
| Body | `{ title?, background?, archived? }` |
| Success | `200 { data: BoardDto }` · logs `BOARD_UPDATED` |
| Errors | `400` · `401` · `403` · `404` |

### DELETE /boards/:boardId
| | |
|--|--|
| Task | BOARD-002 |
| Authorization | ≥ ADMIN |
| Success | `204` (cascade) |
| Errors | `401` · `403` · `404` |

### GET /boards/:boardId/activities
| | |
|--|--|
| Task | CARD-005 |
| Authorization | ≥ VIEWER |
| Query | `limit`, `cursor` ([pagination](README.md#pagination)), optional `cardId` (filters to one card, which must belong to this board, else `404`) |
| Success | `200 { data: ActivityDto[], nextCursor }` |

## Labels (CARD-005)

From CARD-005 on, creating a board also creates 6 default labels (green, yellow, orange, red, purple, blue; empty names). The CARD-005 migration backfills them for boards created earlier.

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

## Realtime (Post-MVP, REALTIME-001)
Board create/update/delete emit `board:created|updated|deleted` to `workspace:{workspaceId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Role matrix: VIEWER create → 403, MEMBER delete → 403, non-member → 404 on every route.
- `GET /boards/:boardId` returns correct ordering and excludes archived lists and cards.
- Archive/unarchive round trip. The listing respects `archived`.
- Activity pagination and the `cardId` filter, including a card from another board → 404.
