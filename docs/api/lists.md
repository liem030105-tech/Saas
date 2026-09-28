# API – Lists

> **Domain:** `lists` module. Conventions, errors, validation, permission matrix: [README](README.md). Ordering algorithm: [relationships.md → Ordering](../database/relationships.md#ordering-position).

**Shared shape:** `ListDto = { id, boardId, title, position, archived, createdAt, updatedAt }` (inside `BoardDetailDto`, each list also carries `cards`).

---

### POST /boards/:boardId/lists
| | |
|--|--|
| Task | LIST-001 |
| Authorization | ≥ MEMBER |
| Body | `{ title, position? }`. Without `position` the list is appended at the end |
| Success | `201 { data: ListDto }` · logs `LIST_CREATED` |
| Errors | `400` · `401` · `403` · `404` |

### PATCH /lists/:listId
| | |
|--|--|
| Task | LIST-002 (`title`, `archived`) · LIST-003 (`position`) |
| Authorization | ≥ MEMBER |
| Body | `{ title?, archived?, position? }` |
| Success | `200 { data: ListDto }` with the final stored `position` |
| Errors | `400` · `401` · `403` · `404` |

**Behavior:**
- A `position` change logs `LIST_MOVED` and may trigger a rebalance of the board's lists in the same transaction.
- `archived: true` logs `LIST_ARCHIVED`. Other changes log `LIST_UPDATED`.
- Lists cannot move to another board (out of scope).

### DELETE /lists/:listId
| | |
|--|--|
| Task | LIST-002 |
| Authorization | ≥ MEMBER |
| Success | `204`. Deletes the list's cards (cascade) |
| Errors | `401` · `403` · `404` |

## Realtime (Post-MVP, REALTIME-001)
`list:created`, `list:updated`, `list:moved`, `list:deleted`, `list:reordered` → room `board:{boardId}`. See [realtime.md](../architecture/realtime.md#events). **MVP tasks do not emit.**

## Required tests
- Create without `position` → last. Insert between two lists → strictly between.
- Repeated inserts into the same gap trigger a rebalance, and the order is preserved.
- Archiving hides the list from `GET /boards/:boardId`.
- VIEWER → 403, non-member → 404.
