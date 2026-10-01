# Realtime Contract (Post-MVP, REALTIME-001)

> **Domain:** Socket.IO connection, rooms, events, and FE cache synchronization. **Nothing here is implemented in the MVP (Phases 0–4).**
> Event names and payload types become code in `packages/shared/src/constants/events.ts` and `packages/shared/src/types/realtime.ts`. Naming convention: **D-16**.

## Principles

1. **All mutations go through REST.** Sockets only broadcast changes that already happened. Clients never mutate data via sockets.
2. **Emit after commit.** Services call emitters only after the DB transaction commits. A rolled-back transaction emits nothing.
3. **One place to emit:** `Trello-Clone-BE/src/realtime/events/<domain>.events.ts`. Services never touch `io` directly.
4. **Server is the only sender** of domain events.

## Connection and authorization

- **Transport:** Socket.IO on the API origin (`VITE_SOCKET_URL`), path `/socket.io`.
- **Authentication:** the client passes the access token in the handshake, `io(url, { auth: { token } })`. The `io.use()` middleware verifies the JWT and sets `socket.data.userId`. Invalid or expired → connection refused with `Error('UNAUTHORIZED')`.
- **Token expiry:** the server does not re-check tokens on an open socket. When the FE refreshes its access token, it reconnects with the new token.
- **Rooms:**

  | Room                      | Joined via                                          | Authorization                                                  |
  | ------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
  | `board:{boardId}`         | client emits `board:join { boardId }` (ack)         | `assertBoardAccess(userId, boardId, 'board.view')`             |
  | `workspace:{workspaceId}` | client emits `workspace:join { workspaceId }` (ack) | `assertWorkspaceAccess(userId, workspaceId, 'workspace.view')` |
  - Ack payload: `{ ok: true }` or `{ ok: false, code: 'NOT_FOUND' }`. Leave with `board:leave` / `workspace:leave`.
  - When a member is removed from a workspace, the server evicts all their sockets from that workspace's rooms (`socketsLeave`) and sends them `member:removed`.

## Event envelope

Every server event has this shape:

```ts
interface RealtimeEvent<TType extends string, TData> {
  eventId: string; // uuid v4, unique per emission – used for de-duplication
  type: TType; // same as the Socket.IO event name
  boardId: string | null; // null for workspace-level events
  workspaceId: string;
  actorId: string; // user who caused the change
  version: number; // updatedAt (epoch ms) of the changed record; Date.now() for deletes
  data: TData;
}
```

## Events

Naming: `<domain>:<past-tense-verb>` (existing convention; D-16 records the alternative dotted style).

| Event             | Room                                         | When emitted (after commit of…)                    | `data`                                                               |
| ----------------- | -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `board:created`   | `workspace:{id}`                             | POST `/workspaces/:id/boards`                      | `BoardDto`                                                           |
| `board:updated`   | `workspace:{id}` + `board:{id}`              | PATCH `/boards/:id`                                | `BoardDto`                                                           |
| `board:deleted`   | `workspace:{id}` + `board:{id}`              | DELETE `/boards/:id`                               | `{ boardId }`                                                        |
| `list:created`    | `board:{id}`                                 | POST `/boards/:id/lists`                           | `ListDto`                                                            |
| `list:updated`    | `board:{id}`                                 | PATCH `/lists/:id` (title/archived)                | `ListDto`                                                            |
| `list:moved`      | `board:{id}`                                 | PATCH `/lists/:id` (position)                      | `{ listId, position }`                                               |
| `list:reordered`  | `board:{id}`                                 | list rebalance                                     | `{ positions: { [listId]: number } }`                                |
| `list:deleted`    | `board:{id}`                                 | DELETE `/lists/:id`                                | `{ listId }`                                                         |
| `card:created`    | `board:{id}`                                 | POST `/lists/:id/cards`                            | `CardSummaryDto`                                                     |
| `card:updated`    | `board:{id}`                                 | PATCH `/cards/:id`, member/label/checklist changes | `CardSummaryDto`                                                     |
| `card:moved`      | `board:{from}` (+ `board:{to}` if different) | PATCH `/cards/:id/move`                            | `{ cardId, fromListId, toListId, fromBoardId, toBoardId, position }` |
| `card:reordered`  | `board:{id}`                                 | card rebalance in a list                           | `{ listId, positions: { [cardId]: number } }`                        |
| `card:deleted`    | `board:{id}`                                 | DELETE `/cards/:id`                                | `{ cardId, listId }`                                                 |
| `comment:created` | `board:{id}`                                 | POST `/cards/:id/comments`                         | `CommentDto`                                                         |
| `comment:updated` | `board:{id}`                                 | PATCH `/comments/:id`                              | `CommentDto`                                                         |
| `comment:deleted` | `board:{id}`                                 | DELETE `/comments/:id`                             | `{ commentId, cardId }`                                              |
| `member:removed`  | `workspace:{id}` + removed user's sockets    | DELETE `/workspaces/:id/members/:userId`           | `{ userId }`                                                         |

Payload DTOs are the same schemas the REST API returns ([api/](../api/README.md)). Attachment events are specified in ATTACHMENTS-001 if needed.

## FE synchronization rules

| Concern                | Rule                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subscription           | `useBoardSocket(boardId)` joins on mount and leaves on unmount; the workspace sidebar joins `workspace:{id}`                                                                                                      |
| Own actions            | Already applied optimistically; ignore events with `actorId === currentUserId`                                                                                                                                    |
| Duplicates             | Keep the last ~200 `eventId`s in an LRU; ignore repeats                                                                                                                                                           |
| Stale events           | Ignore an event whose `version` ≤ the cached record's `updatedAt`. Delete events always apply                                                                                                                     |
| Applying               | Small changes (`*:updated`, `*:moved`, `*:created`) patch the cache with `queryClient.setQueryData(['board', id], …)`; `*:reordered` replaces positions; anything unexpected → `invalidateQueries(['board', id])` |
| Optimistic conflicts   | If a foreign event touches an item with a pending own mutation, apply the event after the mutation settles (the `onSettled` invalidate reconciles)                                                                |
| Reconnect              | On every reconnect after the first: re-join rooms, then `invalidateQueries(['board', id])` and `['boards', workspaceId]` to recover missed events                                                                 |
| Removed from workspace | On `member:removed` for self: leave rooms, clear workspace caches, redirect to `/`                                                                                                                                |

## Scaling / Redis adapter path

- Initially one API instance with the in-memory adapter. **No Redis.**
- With multiple instances: add `@socket.io/redis-adapter` in `realtime/socket.ts` and sticky sessions at the load balancer. Emitters and services **do not change** (principle 3). This requires an ADR and a DEPLOYMENT task update.
