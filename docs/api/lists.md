# API – Lists

> **Domain:** `lists` module. Conventions: [README](README.md). Position algorithm: [relationships.md](../database/relationships.md#ordering-position).

| Method | Endpoint | Authorization | Request → Response | Errors |
|--------|----------|---------------|--------------------|--------|
| POST | `/boards/:id/lists` | ≥ MEMBER | `CreateListInput { title, position? }` → `201 ListDto` | `FORBIDDEN` |
| PATCH | `/lists/:id` | ≥ MEMBER | `UpdateListInput { title?, archived?, position? }` → `200 ListDto` | `FORBIDDEN`, `VALIDATION_ERROR` |
| DELETE | `/lists/:id` | ≥ MEMBER | → `204` (also deletes the list's cards) | `FORBIDDEN` |

## Service responsibilities
- `lists.service`:
  - `create`: appends when `position` is omitted; logs `LIST_CREATED`, emits `list:created`.
  - `update`: a `position` change logs `LIST_MOVED`, rebalances if needed (emits `list:reordered`), and emits `list:moved`; other changes emit `list:updated`.
  - `remove`: emits `list:deleted`.
- Moving a list to another board is out of MVP scope.
- No dedicated repository: direct Prisma access, plus the shared rebalance helper.

## Required tests
- Create without position → appended last; insert between two lists → position falls between them.
- Repeated inserts into the same gap trigger a rebalance and order stays correct.
- VIEWER → 403, non-member → 404.
