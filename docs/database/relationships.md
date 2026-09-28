# Relationships, Cascades, Indexes, Ordering

> **Domain:** explains the relations between models in [schema.md](schema.md). Access rules: [architecture/database.md](../architecture/database.md).

## Relationship map

```
User ─┬─< WorkspaceMember >─ Workspace ─┬─< Board ─┬─< List ─< Card
      ├─< RefreshToken                  ├─< WorkspaceInvite ├─< Label ─< CardLabel >─ Card
      └─ (author/uploader/actor)        └── Subscription    ├─< Card (boardId)
                                                            └─< Activity
Card ─┬─< CardMember >─ User
      ├─< Checklist ─< ChecklistItem
      ├─< Comment
      ├─< Attachment
      └─< Activity (optional cardId)
```

## Cascading deletes

| Deleting | Also deletes |
|----------|--------------|
| Workspace | Members, invites, boards (→ all child data), subscription |
| Board | Lists, cards, labels, activity |
| List | Its cards |
| Card | CardMember, CardLabel, Checklist (+items), comments, attachments; `Activity.cardId` is set to null (activity is kept) |
| User | Memberships, refresh tokens, CardMember, sent invites. **Blocked** (`Restrict`) if the user still has comments, attachments, or activity |

**User account deletion:** do not delete the row. Anonymize it (`email = deleted+<id>@…`, `name = "Deleted user"`, clear `passwordHash`) and revoke all tokens. This preserves comment/activity history.

**Stored files:** DB cascades do not delete objects in S3. The service must collect `storageKey`s before deleting and remove the files after commit (or via a cleanup job).

## Invariants enforced in services
- `Card.boardId === List.boardId` of the card's list. Moving to a list on another board updates `boardId` in the same transaction and removes labels that do not belong to the new board.
- `CardLabel`: the label must belong to the card's board.
- `CardMember`: the assigned user must be a member of the board's workspace.
- A workspace always has ≥ 1 OWNER; removing or demoting the last OWNER is rejected.

## Indexes and key queries

| Query | Index |
|-------|-------|
| A user's workspaces | `WorkspaceMember(userId)` |
| Permission check `(userId, workspaceId)` | PK `WorkspaceMember(userId, workspaceId)` |
| Workspace boards (archived filter) | `Board(workspaceId, archived)` |
| Ordered lists/cards | `List(boardId, position)`, `Card(listId, position)` |
| Cards by board (authorization, search) | `Card(boardId)` |
| Paginated comments/activity | `Comment(cardId, createdAt)`, `Activity(boardId, createdAt)`, `Activity(cardId, createdAt)` |
| Cards assigned to me | `CardMember(userId)` |

Search (Phase 6): start with `ILIKE` scoped by `Card(boardId)`; add a `pg_trgm` GIN index via SQL migration when needed.

## Ordering (position)
- `Float`. Appending: `position = (max ?? 0) + 1024`.
- Inserting between `a` and `b`: `(a + b) / 2`; at the top: `first / 2`.
- **Rebalance** when `|a − b| < 1e-6`: renumber the whole list/column to `1024, 2048, …` in one transaction, then emit `list:reordered` / `card:reordered`.
- `positionBetween()` is a pure helper in `Trello-Clone-BE/src/lib/position.ts`. The FE sends `{ listId, position }` computed for its optimistic update; the server validates it is finite and > 0, rebalances if needed, and returns the final position so the FE can reconcile its cache.
