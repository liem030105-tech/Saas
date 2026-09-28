# API – Cards (members, labels, checklists, comments, attachments)

> **Domain:** `cards` and `comments` modules. Conventions: [README](README.md).

## Cards
| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| POST | `/lists/:id/cards` | ≥ MEMBER | `CreateCardInput { title, position? }` → `201 CardSummaryDto` | `FORBIDDEN` |
| GET | `/cards/:id` | ≥ VIEWER | → `200 CardDetailDto` (members, labels, checklists + items, comment count, attachments) | `NOT_FOUND` |
| PATCH | `/cards/:id` | ≥ MEMBER | `UpdateCardInput { title?, description?, dueDate?, completed?, coverUrl?, archived? }` → `200` | `VALIDATION_ERROR` |
| PATCH | `/cards/:id/move` | ≥ MEMBER | `MoveCardInput { listId, position }` → `200 { id, listId, boardId, position }` | `NOT_FOUND` (list in another workspace) |
| DELETE | `/cards/:id` | ≥ MEMBER | → `204` | – |
| POST | `/cards/:id/members/:userId` | ≥ MEMBER | → `204` | `BUSINESS_RULE_VIOLATION` (user not in workspace) |
| DELETE | `/cards/:id/members/:userId` | ≥ MEMBER | → `204` | – |
| POST | `/cards/:id/labels/:labelId` | ≥ MEMBER | → `204` | `BUSINESS_RULE_VIOLATION` (label from another board) |
| DELETE | `/cards/:id/labels/:labelId` | ≥ MEMBER | → `204` | – |

**Move:** `cards.repository.move` runs in one transaction:
1. Check access to the target `listId`.
2. Update `listId`, `boardId`, `position`.
3. If the board changed, remove labels that do not belong to the new board.
4. Rebalance if needed.
5. Log `CARD_MOVED`.

After commit, emit `card:moved` to both the old and new board if they differ.

## Checklists
| Method | Endpoint | Authorization | Request → Response |
|--------|----------|---------------|--------------------|
| POST | `/cards/:id/checklists` | ≥ MEMBER | `{ title }` → `201 ChecklistDto` |
| PATCH / DELETE | `/checklists/:id` | ≥ MEMBER | `{ title?, position? }` → `200` / `204` |
| POST | `/checklists/:id/items` | ≥ MEMBER | `{ content }` → `201 ChecklistItemDto` |
| PATCH / DELETE | `/checklists/:id/items/:itemId` | ≥ MEMBER | `{ content?, done?, position? }` → `200` / `204` |

## Comments (`comments` module)
| Method | Endpoint | Authorization | Request → Response |
|--------|----------|---------------|--------------------|
| GET | `/cards/:id/comments` | ≥ VIEWER | `?limit&cursor` → `200 CommentDto[] + nextCursor` |
| POST | `/cards/:id/comments` | ≥ MEMBER | `{ content (1–5000, markdown) }` → `201 CommentDto` |
| PATCH | `/comments/:id` | Author only | `{ content }` → `200` |
| DELETE | `/comments/:id` | Author or ≥ ADMIN | → `204` |

Creating a comment logs `COMMENT_ADDED` and emits `comment:created`. Markdown is stored raw and sanitized by the FE at render time.

## Attachments (Phase 6)
| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| POST | `/cards/:id/attachments` | ≥ MEMBER | `multipart/form-data` field `file` → `201 AttachmentDto` | `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` |
| DELETE | `/attachments/:id` | Uploader or ≥ ADMIN | → `204` | – |

## Required tests
- Move within a list, to another list, to another board (labels removed, `boardId` updated).
- Move to a list in another workspace → 404 and data unchanged.
- Attaching another board's label → 422; assigning a non-member → 422.
- Comments: non-author edit → 403; ADMIN deleting someone else's comment → 204.
- Uploads: oversized file, wrong MIME (an `.exe` renamed to `.png`).
