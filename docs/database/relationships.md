# Relationships, Cascades, Invariants, Ordering

> **Domain:** how the models in [schema.md](schema.md) relate, what happens on delete, the invariants services must keep, and the ordering algorithm.
> Access rules: [architecture/database.md](../architecture/database.md).

## Relationship map

```
User ─┬─< WorkspaceMember >─ Workspace ─┬─< Board ─┬─< List ─< Card
      ├─< RefreshToken                  ├─< WorkspaceInvite ├─< Label ─< CardLabel >─ Card
      └─ (comment author / uploader /   └── Subscription    ├─< Card (denormalized boardId)
          activity actor / inviter)                         └─< Activity
Card ─┬─< CardMember >─ User
      ├─< Checklist ─< ChecklistItem
      ├─< Comment
      ├─< Attachment
      └─< Activity (optional cardId)
```

## Foreign keys and delete behavior

| Child.field                 | → Parent     | On delete         | Reason                                          |
| --------------------------- | ------------ | ----------------- | ----------------------------------------------- |
| RefreshToken.userId         | User         | Cascade           | Tokens are meaningless without the user         |
| WorkspaceMember.userId      | User         | Cascade           |                                                 |
| WorkspaceMember.workspaceId | Workspace    | Cascade           |                                                 |
| WorkspaceInvite.workspaceId | Workspace    | Cascade           |                                                 |
| WorkspaceInvite.invitedById | User         | Cascade           | Pending invites from a removed user are dropped |
| Board.workspaceId           | Workspace    | Cascade           | Deleting a workspace deletes everything in it   |
| List.boardId                | Board        | Cascade           |                                                 |
| Card.boardId                | Board        | Cascade           |                                                 |
| Card.listId                 | List         | Cascade           | Deleting a list deletes its cards               |
| CardMember.cardId / userId  | Card / User  | Cascade / Cascade |                                                 |
| Label.boardId               | Board        | Cascade           |                                                 |
| CardLabel.cardId / labelId  | Card / Label | Cascade / Cascade | Deleting a label detaches it from cards         |
| Checklist.cardId            | Card         | Cascade           |                                                 |
| ChecklistItem.checklistId   | Checklist    | Cascade           |                                                 |
| Comment.cardId              | Card         | Cascade           |                                                 |
| Comment.authorId            | User         | **Restrict**      | Preserve history; users are anonymized instead  |
| Attachment.cardId           | Card         | Cascade           | DB row only; files are removed by the service   |
| Attachment.uploaderId       | User         | **Restrict**      | Preserve history                                |
| Activity.boardId            | Board        | Cascade           |                                                 |
| Activity.cardId             | Card         | **SetNull**       | Keep board history after a card is deleted      |
| Activity.userId             | User         | **Restrict**      | Preserve history                                |
| Subscription.workspaceId    | Workspace    | Cascade           |                                                 |

**User account deletion** (not in MVP scope): never delete the row. Anonymize it (`email = deleted+<id>@invalid`, `name = "Deleted user"`, random `passwordHash`), delete memberships, and revoke all tokens.

**Stored files:** DB cascades do not remove objects from storage. Before deleting a card, list, board, or workspace, the service collects affected `Attachment.storageKey`s and deletes the objects **after** commit (ATTACHMENTS-001).

## Invariants enforced by services

| #   | Invariant                                          | Enforced in                                                                                               |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| I1  | `Card.boardId === Card.list.boardId`               | Card create/move (CARD-001, CARD-003)                                                                     |
| I2  | A card label belongs to the card's board           | CARD-005 (attach), CARD-003 (cross-board move removes foreign labels)                                     |
| I3  | A card member is a member of the board's workspace | CARD-005 (assign); WORKSPACE-003 (removing a member also removes their CardMember rows in that workspace) |
| I4  | Every workspace has ≥ 1 OWNER                      | WORKSPACE-003                                                                                             |
| I5  | Invites never grant `OWNER`                        | WORKSPACE-004                                                                                             |
| I6  | A card can move only within its workspace          | CARD-003                                                                                                  |

## Indexes and key queries

| Query                                      | Index                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| A user's workspaces                        | `WorkspaceMember(userId)`                                                                                                  |
| Permission check `(userId, workspaceId)`   | PK `WorkspaceMember(userId, workspaceId)`                                                                                  |
| Workspace members                          | `WorkspaceMember(workspaceId)`                                                                                             |
| Workspace boards filtered by `archived`    | `Board(workspaceId, archived)`                                                                                             |
| Ordered lists / cards / checklists / items | `List(boardId, position)`, `Card(listId, position)`, `Checklist(cardId, position)`, `ChecklistItem(checklistId, position)` |
| Cards of a board (authorization, search)   | `Card(boardId)`                                                                                                            |
| Paginated comments                         | `Comment(cardId, createdAt)`                                                                                               |
| Paginated activity per board / card        | `Activity(boardId, createdAt)`, `Activity(cardId, createdAt)`                                                              |
| Cards assigned to a user                   | `CardMember(userId)`                                                                                                       |
| Refresh-token lookup / family revoke       | `RefreshToken(tokenHash)` UQ, `RefreshToken(familyId)`                                                                     |
| Invite lookup                              | `WorkspaceInvite(tokenHash)` UQ                                                                                            |

Search (SEARCH-001): start with `ILIKE` scoped by `Card(boardId)`; add a `pg_trgm` GIN index via SQL migration only if needed.

## Ordering (position)

Applies to List (within a board), Card (within a list), Checklist (within a card), and ChecklistItem (within a checklist). The constants and pure helpers live once in `packages/shared/src/utils/position.ts` (unit-tested): the BE uses them for stored positions and the FE for optimistic updates (ADR-017). Rebalancing touches the database and runs only on the BE.

| Case                                   | Position                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| First item in an empty container       | `1024`                                                                             |
| Insert at end                          | `last + 1024`                                                                      |
| Insert at beginning                    | `first / 2`                                                                        |
| Insert between `a` and `b`             | `(a + b) / 2`                                                                      |
| Move to another list (same board)      | Computed in the **target** list with the rules above; the source list is untouched |
| Move to another board (same workspace) | Same as above, plus `boardId` update and foreign-label removal (I1, I2)            |

Sort order is `position ASC, id ASC`; the `id` tie-break makes equal positions deterministic.

### Rebalancing

- **Threshold:** after a write, if the gap between the written item and either neighbour is `< 1e-6`, or `position < 1e-6`, rebalance the whole container.
- **Rebalance:** renumber all non-archived **and** archived items of the container in current sort order to `1024, 2048, 3072, …`.
- **Transaction:** the write and the rebalance run in one `prisma.$transaction`. It starts with `SELECT id FROM "<Table>" WHERE "<containerId>" = $1 ORDER BY id FOR NO KEY UPDATE` to lock the container's rows in a fixed order, so concurrent writes and rebalances serialize without deadlocks (`NO KEY` leaves foreign-key checks on those rows unblocked). Implementation: `lockContainers` (several containers in one id-ordered statement, e.g. a card move's source and target lists), `lockContainer`, `appendPosition`, `settlePosition` and `rebalanceContainer(tx, table, containerColumn, containerId)` in `Trello-Clone-BE/src/lib/rebalance.ts` (LIST-003), used for lists, cards, checklists and checklist items (CARD-005c). All four also take the lock when created, so concurrent appends to a container that has items get distinct positions (an empty container has no rows to lock).
- **Notification:** from REALTIME-001 on, a rebalance emits `list:reordered` or `card:reordered` with the full new position map. Before that, clients reconcile by refetching (see below).

### Server rules for client-supplied positions

- The client sends the position it computed for its optimistic update (see [api/cards.md → Move](../api/cards.md#patch-cardscardidmove)).
- The server rejects non-finite values and values `<= 0` with `400 VALIDATION_ERROR`, then applies the threshold check above.
- The server returns the final stored position. The FE keeps its optimistic order and takes the final positions from the board refetch after its last pending move, because a rebalance renumbers the siblings too ([frontend.md → Drag and drop](../architecture/frontend.md#drag-and-drop-with-optimistic-updates)).

### Concurrency

- Concurrent moves are **last-write-wins** per item. No version check is done in the MVP.
- Two clients inserting into the same gap may produce equal positions; the `id` tie-break keeps the order deterministic, and the next write into that gap triggers a rebalance.
- Clients converge by refetching after their own mutation (MVP) and through realtime events (Post-MVP).
