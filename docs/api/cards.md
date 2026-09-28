# API – Cards, Card Members, Card Labels, Checklists, Comments, Attachments

> **Domain:** `cards` module (members, labels, checklists, attachments of a card) and `comments` module. Conventions, errors, validation, permission matrix: [README](README.md).

**Shared shapes**
- `CardSummaryDto`: see [boards.md](boards.md).
- `CardDetailDto = CardSummaryDto & { boardId, description, archived, createdAt, updatedAt, members: UserSummary[], labels: LabelDto[], checklists: ChecklistDto[], attachments: AttachmentDto[] }`
- `UserSummary = { id, name, avatarUrl }`
- `ChecklistDto = { id, title, position, items: ChecklistItemDto[] }` · `ChecklistItemDto = { id, content, done, position }`
- `CommentDto = { id, cardId, content, createdAt, updatedAt, author: UserSummary }`
- `AttachmentDto = { id, fileName, mimeType, size, url, createdAt, uploader: UserSummary }`

---

## Cards

### POST /lists/:listId/cards
| | |
|--|--|
| Task | CARD-001 |
| Authorization | ≥ MEMBER |
| Body | `{ title, position? }`. Appended at the end if `position` is omitted |
| Success | `201 { data: CardSummaryDto }`. `boardId` is copied from the list (I1) · logs `CARD_CREATED` |
| Errors | `400` · `401` · `403` · `404` |

### GET /cards/:cardId
| | |
|--|--|
| Task | CARD-002 (base fields) · CARD-005 (members, labels, checklists) · ATTACHMENTS-001 (attachments) |
| Authorization | ≥ VIEWER |
| Success | `200 { data: CardDetailDto }`. Archived cards are returned (the modal shows an "archived" banner) |
| Errors | `401` · `404` |

### PATCH /cards/:cardId
| | |
|--|--|
| Task | CARD-002 |
| Authorization | ≥ MEMBER |
| Body | `{ title?, description?, dueDate?, completed?, archived? }`. `coverUrl` is added by ATTACHMENTS-001 |
| Success | `200 { data: CardDetailDto }` · logs `CARD_ARCHIVED` when archiving, otherwise `CARD_UPDATED` |
| Errors | `400` · `401` · `403` · `404` |

### PATCH /cards/:cardId/move
| | |
|--|--|
| Task | CARD-003 |
| Authorization | ≥ MEMBER on the card's workspace |
| Body | `{ listId: cuid, position: number }`. `listId` may equal the current list (reorder) |
| Success | `200 { data: { id, listId, boardId, position, updatedAt } }` with the **final stored** position |
| Errors | `400` (invalid position) · `401` · `403` · `404` (card or target list not visible to the caller) · `422` rule `CROSS_WORKSPACE_MOVE` (target list is visible but in another workspace) |

**Transaction** (`cards.repository.move`):
1. Load the card and target list with access checks (tenant rule 4).
2. Lock the target list's card rows (`FOR UPDATE`).
3. Set `listId`, `boardId` (from the target list), and `position`.
4. If the board changed, delete `CardLabel` rows whose label belongs to the old board (I2). Card members stay, because they share the workspace.
5. Rebalance the target list if the threshold is hit ([relationships.md](../database/relationships.md#rebalancing)).
6. Log `CARD_MOVED` with `data = { fromListId, toListId, fromBoardId, toBoardId }`.

Moving to an archived list is allowed. Archived cards can be moved.

### DELETE /cards/:cardId
| | |
|--|--|
| Task | CARD-002 |
| Authorization | ≥ MEMBER |
| Success | `204` (cascade; `Activity.cardId` is set to null) |
| Errors | `401` · `403` · `404` |

## Card members & labels (CARD-005)
| Method | Path | Authorization | Success | Errors |
|--------|------|---------------|---------|--------|
| POST | `/cards/:cardId/members/:userId` | ≥ MEMBER | `204` (idempotent) | `404` (card not visible) · `422` rule `NOT_WORKSPACE_MEMBER` (I3) |
| DELETE | `/cards/:cardId/members/:userId` | ≥ MEMBER | `204` (idempotent) | `404` |
| POST | `/cards/:cardId/labels/:labelId` | ≥ MEMBER | `204` (idempotent) | `404` (card or label not visible) · `422` rule `LABEL_OTHER_BOARD` (I2) |
| DELETE | `/cards/:cardId/labels/:labelId` | ≥ MEMBER | `204` (idempotent) | `404` |

Assigning or removing a member logs `MEMBER_ADDED` / `MEMBER_REMOVED` with `data.userId`.

## Checklists (CARD-005)
| Method | Path | Authorization | Body → Success |
|--------|------|---------------|----------------|
| POST | `/cards/:cardId/checklists` | ≥ MEMBER | `{ title }` → `201 { data: ChecklistDto }` (appended) |
| PATCH | `/checklists/:checklistId` | ≥ MEMBER | `{ title?, position? }` → `200 { data: ChecklistDto }` |
| DELETE | `/checklists/:checklistId` | ≥ MEMBER | → `204` |
| POST | `/checklists/:checklistId/items` | ≥ MEMBER | `{ content }` → `201 { data: ChecklistItemDto }` (appended) |
| PATCH | `/checklists/:checklistId/items/:itemId` | ≥ MEMBER | `{ content?, done?, position? }` → `200 { data: ChecklistItemDto }` |
| DELETE | `/checklists/:checklistId/items/:itemId` | ≥ MEMBER | → `204` |

Errors for all: `400` · `401` · `403` · `404` (including an `itemId` that does not belong to `checklistId`).

## Comments (CARD-005, `comments` module)
| Method | Path | Authorization | Body → Success |
|--------|------|---------------|----------------|
| GET | `/cards/:cardId/comments` | ≥ VIEWER | `?limit&cursor` → `200 { data: CommentDto[], nextCursor }` (newest first) |
| POST | `/cards/:cardId/comments` | ≥ MEMBER | `{ content }` → `201 { data: CommentDto }` · logs `COMMENT_ADDED` |
| PATCH | `/comments/:commentId` | Author, and caller role ≥ MEMBER | `{ content }` → `200 { data: CommentDto }` |
| DELETE | `/comments/:commentId` | Author with role ≥ MEMBER, or ≥ ADMIN | → `204` |

Errors: `400` · `401` · `403` (not the author / insufficient role) · `404`. Markdown is stored raw and sanitized by the FE when rendered.

## Attachments (Post-MVP, ATTACHMENTS-001)
| Method | Path | Authorization | Body → Success | Errors |
|--------|------|---------------|----------------|--------|
| POST | `/cards/:cardId/attachments` | ≥ MEMBER | `multipart/form-data`, field `file` → `201 { data: AttachmentDto }` · logs `ATTACHMENT_ADDED` | `413` · `415` · `403` · `404` |
| DELETE | `/attachments/:attachmentId` | Uploader (≥ MEMBER) or ≥ ADMIN | → `204` (file deleted after commit) | `403` · `404` |

Limits: D-10 (size), D-19 (MIME allowlist).

## Realtime (Post-MVP, REALTIME-001)
`card:created|updated|moved|deleted|reordered` and `comment:created|updated|deleted` → room `board:{boardId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Move within a list, to another list, and to another board (`boardId` updated, foreign labels removed, members kept).
- Move to a list in a workspace the caller cannot see → 404, and the data is unchanged. Visible but in another workspace → 422.
- Move with `position <= 0` or `NaN` → 400. A rebalance keeps the order.
- Attaching another board's label → 422. Assigning a non-member → 422.
- Comments: a non-author edit → 403. An ADMIN deleting another's comment → 204. A VIEWER-author deleting their own → 403.
- Pagination of comments.
