# API – Cards, Card Members, Card Labels, Checklists, Comments, Attachments

> **Domain:** `cards` module (members, labels, checklists, attachments of a card) and `comments` module. Conventions, errors, validation, permission matrix: [README](README.md).

**Shared shapes**
- `CardSummaryDto`: see [boards.md](boards.md).
- `CardDetailDto = CardSummaryDto & { boardId, description, archived, createdAt, updatedAt, members: UserSummary[], labels: LabelDto[], checklists: ChecklistDto[], attachments: AttachmentDto[] }`
- `UserSummary = { id, name, avatarUrl }`
- `ChecklistDto = { id, title, position, items: ChecklistItemDto[] }` · `ChecklistItemDto = { id, content, done, position }`
- `CommentDto = { id, cardId, content, createdAt, updatedAt, author: UserSummary }`
- `AttachmentDto = { id, fileName, mimeType, size, url, createdAt, uploader: UserSummary }`. `url` is a signed URL that expires (D-27, ADR-020): refetch the card for a fresh one.

---

## Cards

### POST /lists/:listId/cards
| | |
|--|--|
| Task | CARD-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (the list resolves to its stored board → `assertBoardAccess(…, 'card.edit')`) |
| Body | `{ title, position? }` (title trimmed, 1–200 chars). Appended at the end if `position` is omitted |
| Success | `201 { data: CardSummaryDto }`. `boardId` is copied from the list (I1; a `boardId` in the body is ignored) · logs `CARD_CREATED` with `cardId` and `data: { listId, title }` |
| Errors | `400` · `401` · `403` · `404` (unknown list, malformed id, or not a member) · `429 RATE_LIMITED` |

**Behavior:** like lists ([lists.md → POST](lists.md#post-boardsboardidlists)): the list's cards are locked first; without `position` the card goes after the list's last card (archived ones included); a client `position` goes through the rebalance check, so the response may carry a renumbered position. Adding a card to an archived list is allowed by the API (the FE does not show archived lists). Schemas: `CreateCardInputSchema`, `CardSummaryDtoSchema` (`@trello-clone/shared`).

### GET /cards/:cardId
| | |
|--|--|
| Task | CARD-002 (base fields) · CARD-005 (members, labels, checklists) · ATTACHMENTS-001 (attachments) |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER (the card's stored `boardId` → `assertBoardAccess(…, 'card.view')`) |
| Success | `200 { data: CardDetailDto }`. Archived cards are returned (the modal shows an "archived" banner). `labels` (by id) since CARD-005a, `members` (`UserSummary`, by id) since CARD-005b, `checklists` (and their items, by `position, id`) since CARD-005c; `attachments` (newest first, each with a fresh signed `url`) since ATTACHMENTS-001a |
| Errors | `401` · `404` (unknown card, malformed id, or not a member) · `429 RATE_LIMITED` |

### PATCH /cards/:cardId
| | |
|--|--|
| Task | CARD-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (`assertBoardAccess(…, 'card.edit')` on the card's stored board) |
| Body | `{ title?, description?, dueDate?, completed?, archived? }`, at least one. `description` and `dueDate` accept `null` to clear them; `dueDate` is an ISO 8601 datetime with `Z` or an offset. Since ATTACHMENTS-001 also `coverAttachmentId`: one of this card's image attachments, or `null` to remove the cover (another card's attachment or a non-image → `422 BUSINESS_RULE_VIOLATION`, rule `COVER_NOT_IMAGE_OF_CARD`) |
| Success | `200 { data: CardDetailDto }` · logs `CARD_ARCHIVED` when archiving, otherwise `CARD_UPDATED`, with the changed fields in `data` (a changed description only as `description: true`, so the log never copies long text) |
| Errors | `400` · `401` · `403` · `404` · `429 RATE_LIMITED` |

Schemas: `UpdateCardInputSchema`, `CardDetailDtoSchema` (`@trello-clone/shared`).

### PATCH /cards/:cardId/move
| | |
|--|--|
| Task | CARD-003 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER on the card's workspace |
| Body | `{ listId: cuid, position: number }` (`position` finite and `> 0`). `listId` may equal the current list (reorder) |
| Success | `200 { data: { id, listId, boardId, position, updatedAt } }` with the **final stored** position |
| Errors | `400` (invalid body) · `401` · `403` · `404` (card or target list not visible to the caller, or deleted meanwhile) · `409 CONFLICT` (the card kept moving under concurrent moves; retry) · `422` rule `CROSS_WORKSPACE_MOVE` (target list is visible but in another workspace) · `429 RATE_LIMITED` |

**Transaction** (`cards.repository.move`):
1. Load the card and target list with access checks (tenant rule 4), in `cards.service.move` before the transaction: `card.edit` on the card's board; the target list's board must be visible to the caller (`404` otherwise); a different workspace is the `422`.
2. Lock the card rows of the card's current list and of the target list, together in one id-ordered statement (`lockContainers`, `FOR NO KEY UPDATE`), so moves in opposite directions between two lists wait for each other instead of deadlocking. The card's current list is read again under the locks (it is the `from` of the activity); if a concurrent move took the card elsewhere first, that list is locked too (after three such changes the move answers `409 CONFLICT`).
3. Set `listId`, `boardId` (from the target list), and `position`.
4. If the board changed, delete `CardLabel` rows whose label belongs to another board (I2; CARD-005a). Card members stay, because they share the workspace.
5. Rebalance the target list if the threshold is hit ([relationships.md](../database/relationships.md#rebalancing)).
6. Log `CARD_MOVED` on the target board with `data = { fromListId, toListId, fromBoardId, toBoardId }`, in the same transaction.

Schemas: `MoveCardInputSchema`, `MoveCardResultSchema` (`@trello-clone/shared`). Moves that touch the same non-empty list run one after the other (step 2); an empty list has no rows to lock, so two moves into it may commit together. Either way the order is always `position, id`.

Moving to an archived list is allowed. Archived cards can be moved.

### DELETE /cards/:cardId
| | |
|--|--|
| Task | CARD-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (as PATCH) |
| Success | `204` (cascade; `Activity.cardId` is set to null). Logs nothing |
| Errors | `401` · `403` · `404` (also when already deleted) · `429 RATE_LIMITED` |

## Card members & labels (CARD-005)
| Method | Path | Authorization | Success | Errors |
|--------|------|---------------|---------|--------|
| POST | `/cards/:cardId/members/:userId` | ≥ MEMBER | `204` (idempotent) | `404` (card not visible) · `422` rule `NOT_WORKSPACE_MEMBER` (I3; also for a user id that does not exist, so the answer reveals nothing). Any role of the workspace can be assigned |
| DELETE | `/cards/:cardId/members/:userId` | ≥ MEMBER | `204` (idempotent) | `404` |
| POST | `/cards/:cardId/labels/:labelId` | ≥ MEMBER | `204` (idempotent) | `404` (card or label not visible) · `422` rule `LABEL_OTHER_BOARD` (I2) |
| DELETE | `/cards/:cardId/labels/:labelId` | ≥ MEMBER | `204` (idempotent) | `404` |

Assigning or removing a member logs `MEMBER_ADDED` / `MEMBER_REMOVED` with `data.userId`, only when it changes something (CARD-005b). The assignment holds the person's workspace membership row `FOR KEY SHARE` until it commits, so it cannot race their removal from the workspace into breaking I3. Attaching or detaching a label logs `LABEL_ADDED` / `LABEL_REMOVED` with `data: { labelId, name, color }` (the label as it was, so the feed can name it after it is deleted), only when it changes something (D-25); deleting a label, or a cross-board move that drops it, logs nothing for the cards that carried it. The detach holds the card row first, like a card delete, so the two cannot deadlock. The attach re-reads the card's board under a row lock, so it cannot race a cross-board move into breaking I2; a label the card does not have detaches as a no-op, and a label of another board the caller cannot see is a `404` like one that does not exist.

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

Since CARD-005c. All six need `card.assign` (≥ MEMBER) on the card's stored board; an unknown or malformed id and one the caller cannot see are the same `404`. Checklists are ordered within the card and items within the checklist by `position, id`, exactly like lists and cards: a new one is appended, a client `position` goes through the rebalance check, and each container's rows are locked first so concurrent writers run in turn. Adding and deleting a checklist log `CHECKLIST_ADDED` / `CHECKLIST_REMOVED` with `data: { checklistId, title }`, and a change of an item's `done` logs `CHECKLIST_ITEM_CHECKED` with `data: { checklistId, itemId, content, done }` (the card row and then the item row are locked first, so two clients ticking it at once log it once, and a concurrent card delete waits instead of deadlocking); renames, item adds and deletes, and moves log nothing (D-25). Schemas: `CreateChecklistInputSchema`, `UpdateChecklistInputSchema`, `CreateChecklistItemInputSchema`, `UpdateChecklistItemInputSchema`, `ChecklistDtoSchema`, `ChecklistItemDtoSchema` (`@trello-clone/shared`).

## Comments (CARD-005, `comments` module)
| Method | Path | Authorization | Body → Success |
|--------|------|---------------|----------------|
| GET | `/cards/:cardId/comments` | ≥ VIEWER | `?limit&cursor` → `200 { data: CommentDto[], nextCursor }` (newest first) |
| POST | `/cards/:cardId/comments` | ≥ MEMBER | `{ content }` → `201 { data: CommentDto }` · logs `COMMENT_ADDED` |
| PATCH | `/comments/:commentId` | Author, and caller role ≥ MEMBER | `{ content }` → `200 { data: CommentDto }` |
| DELETE | `/comments/:commentId` | Author with role ≥ MEMBER, or ≥ ADMIN | → `204` |

Errors: `400` · `401` · `403` (not the author / insufficient role) · `404`. Markdown is stored raw and sanitized by the FE when rendered.

Since CARD-005d. `content` is trimmed, 1–5000 characters (`CommentContentSchema`). The list follows the [pagination convention](README.md#pagination) (`limit` per D-14): newest first by `createdAt, id`, `cursor` is the id of the last comment of the previous page, and `nextCursor` is `null` on the last page; a cursor that is not a comment of this card → `400 VALIDATION_ERROR` (`path: "cursor"`), the same for a foreign id and one nothing has. Edit and delete check the caller's role on the comment's board **now**: an author demoted to VIEWER can no longer change their comments (403), and an unknown or malformed `commentId` and one the caller cannot see are the same `404`. Only a new comment is logged (`COMMENT_ADDED`, `data: { commentId }`); edits and deletes log nothing. Schemas: `CommentInputSchema`, `ListCommentsQuerySchema`, `CommentDtoSchema`, `CommentsPageSchema` (`@trello-clone/shared`).

## Attachments (Post-MVP, ATTACHMENTS-001)
| Method | Path | Authorization | Body → Success | Errors |
|--------|------|---------------|----------------|--------|
| POST | `/cards/:cardId/attachments` | ≥ MEMBER | `multipart/form-data`, field `file` → `201 { data: AttachmentDto }` · logs `ATTACHMENT_ADDED` | `413` · `415` · `403` · `404` |
| DELETE | `/attachments/:attachmentId` | Uploader (≥ MEMBER) or ≥ ADMIN | → `204` (file deleted after commit) | `403` · `404` |

Logs `ATTACHMENT_ADDED` with `data: { attachmentId, fileName }`; a delete logs nothing. The card's attachments come with `GET /cards/:cardId`, newest first. Limits: D-10 (size; the Free value for every workspace until BILLING-001), D-19 (MIME allowlist, checked by the file's bytes, not its name). The file is stored in S3 (ADR-020) before the row is written; if the write fails, the object is deleted again. Deleting an attachment that is the card's cover clears the cover. Every attachment change sends `card:updated`.

## Realtime (Post-MVP, REALTIME-001)
`card:created|updated|moved|deleted|reordered` and `comment:created|updated|deleted` → room `board:{boardId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Move within a list, to another list, and to another board (`boardId` updated, foreign labels removed, members kept).
- Move to a list in a workspace the caller cannot see → 404, and the data is unchanged. Visible but in another workspace → 422.
- Move with `position <= 0` or `NaN` → 400. A rebalance keeps the order.
- Attaching another board's label → 422. Assigning a non-member → 422.
- Comments: a non-author edit → 403. An ADMIN deleting another's comment → 204. A VIEWER-author deleting their own → 403.
- Pagination of comments.
