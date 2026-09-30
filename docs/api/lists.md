# API – Lists

> **Domain:** `lists` module. Conventions, errors, validation, permission matrix: [README](README.md). Ordering algorithm: [relationships.md → Ordering](../database/relationships.md#ordering-position).

**Shared shape:** `ListDto = { id, boardId, title, position, archived, createdAt, updatedAt }` (inside `BoardDetailDto`, each list also carries `cards`).

---

### POST /boards/:boardId/lists
| | |
|--|--|
| Task | LIST-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (`assertBoardAccess(…, 'list.manage')`) |
| Body | `{ title, position? }`. Without `position` the list is appended at the end |
| Success | `201 { data: ListDto }` · logs `LIST_CREATED` (`data: { listId, title }`) in the same transaction |
| Errors | `400` · `401` · `403` · `404` (unknown board, malformed id, or not a member) · `429 RATE_LIMITED` |

**Behavior:** the append position is `last + 1024` over **all** the board's lists, archived ones included (`1024` on an empty board), so a new list never lands between an archived list and its place on unarchive. A client `position` must be finite and `> 0` and is stored as sent; the rebalance check arrives with LIST-003. Two concurrent appends may get the same position; the `id` tie-break keeps the order deterministic. The FE hides the composer on an archived board ([ui.md → Board](../design/ui.md)); the API does not check `archived`. Schemas: `CreateListInputSchema`, `ListDtoSchema` (`@trello-clone/shared`); position helpers: `packages/shared/src/utils/position.ts` (ADR-017).

### PATCH /lists/:listId
| | |
|--|--|
| Task | LIST-002 (`title`, `archived`) · LIST-003 (`position`) |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (the list resolves to its stored board → `assertBoardAccess(…, 'list.manage')`) |
| Body | `{ title?, archived?, position? }`, at least one. Until LIST-003, `position` is ignored (a body with only `position` is `400`) |
| Success | `200 { data: ListDto }` with the final stored `position` |
| Errors | `400` · `401` · `403` · `404` (unknown list, malformed id, or not a member) · `429 RATE_LIMITED` |

**Behavior:**
- A `position` change logs `LIST_MOVED` and may trigger a rebalance of the board's lists in the same transaction.
- `archived: true` logs `LIST_ARCHIVED`. Other changes (a rename, `archived: false`) log `LIST_UPDATED`. The entry's `data` is `{ listId, …changed fields }`, written in the same transaction.
- An archived list keeps its `position`, so unarchiving puts it back where it was. It is hidden from `GET /boards/:boardId`.
- Lists cannot move to another board (out of scope).
- Schema: `UpdateListInputSchema` (`@trello-clone/shared`).

### DELETE /lists/:listId
| | |
|--|--|
| Task | LIST-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ MEMBER (as PATCH) |
| Success | `204`. Deletes the list's cards (cascade, from CARD-001). Logs nothing: the list's history goes with it |
| Errors | `401` · `403` · `404` (unknown list, malformed id, not a member, or already deleted) · `429 RATE_LIMITED` |

## Realtime (Post-MVP, REALTIME-001)
`list:created`, `list:updated`, `list:moved`, `list:deleted`, `list:reordered` → room `board:{boardId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Create without `position` → last. Insert between two lists → strictly between.
- Repeated inserts into the same gap trigger a rebalance, and the order is preserved.
- Archiving hides the list from `GET /boards/:boardId`.
- VIEWER → 403, non-member → 404.
