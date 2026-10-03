# Realtime Contract (Post-MVP, REALTIME-001)

> **Domain:** Socket.IO connection, rooms, events, and FE cache synchronization. Not part of the MVP (Phases 0–4); REALTIME-001 delivers it in sub-PRs: 001a connection and rooms, 001b service emits, 001c FE sync, 001d E2E.
> Event names and payload types are code in `packages/shared/src/constants/events.ts` (`REALTIME_EVENTS`, `ROOM_EVENTS`; room names are built on the server only) and `packages/shared/src/types/realtime.ts` (`RealtimeEvent`, `RealtimeEventData`, `RoomAck`). Naming convention: **D-16** (its default, `domain:verb`).

## Principles
1. **All mutations go through REST.** Sockets only broadcast changes that already happened. Clients never mutate data via sockets.
2. **Emit after commit.** Services call emitters only after the DB transaction commits. A rolled-back transaction emits nothing.
3. **One place to emit:** `Trello-Clone-BE/src/realtime/events/<domain>.events.ts`. Services never touch `io` directly.
4. **Server is the only sender** of domain events.

## Connection and authorization
- **Transport:** Socket.IO on the API origin (`VITE_SOCKET_URL`), path `/socket.io`.
- **Authentication:** the client passes the access token in the handshake, `io(url, { auth: { token } })`. The `io.use()` middleware verifies the JWT and sets `socket.data.userId`. Invalid or expired → connection refused with `Error('UNAUTHORIZED')`.
- **Token expiry:** the server does not re-check tokens on an open socket. Every handshake (the first and each reconnect) sends the FE's current access token; a handshake refused as `UNAUTHORIZED` makes the FE refresh the token and connect again (at most 3 times in a row), and a refresh refused with 401 ends the session like a REST request would.
- **Rooms:**

  | Room | Joined via | Authorization |
  |------|-----------|---------------|
  | `board:{boardId}` | client emits `board:join { boardId }` (ack) | `assertBoardAccess(userId, boardId, 'board.view')` |
  | `workspace:{workspaceId}` | client emits `workspace:join { workspaceId }` (ack) | `assertWorkspaceAccess(userId, workspaceId, 'workspace.view')` |

  - Ack payload: `{ ok: true }`, `{ ok: false, code: 'NOT_FOUND' }` (a missing room or one the caller may not see, alike), `{ ok: false, code: 'VALIDATION_ERROR' }` (the id is not a cuid) or `{ ok: false, code: 'INTERNAL_ERROR' }` (the check itself failed, e.g. the database is down; logged on the server). A socket's room messages are handled in the order sent, so a join cannot land after a later leave. A join checks access again once the socket is in the room and leaves if access is gone, so a join racing the member's removal cannot outlive the eviction. Leave with `board:leave` / `workspace:leave` (same payloads, always `{ ok: true }` when valid). A message without an ack callback is still handled.
  - Code: `Trello-Clone-BE/src/realtime/socket.ts` (`attachRealtime`, wired in `server.ts`; CORS is `CLIENT_URL`, like the REST API) and `realtime/rooms.ts`.
  - Every socket also joins `user:{userId}` on connect (server-side only), so the server can reach all of a user's sockets. Notifications (NOTIFICATIONS-001) are sent there.
  - When a member is removed from a workspace, the server sends `member:removed` to the workspace room and to their sockets, then evicts their sockets from the workspace's room and its boards' rooms (`socketsLeave`). Deleting a board empties its room the same way, after `board:deleted`.

## Event envelope
Every server event has this shape:
```ts
interface RealtimeEvent<TType extends string, TData> {
  eventId: string;   // uuid v4, unique per emission – used for de-duplication
  type: TType;       // same as the Socket.IO event name
  boardId: string | null;       // null for workspace-level events
  workspaceId: string | null; // null only for notification:updated { all: true } (see Events)
  actorId: string;   // user who caused the change (display only; never a reason to skip an event)
  version: number;   // updatedAt (epoch ms) of the changed record; Date.now() for deletes and *:reordered
  data: TData;
}
```

## Events
Naming: `<domain>:<past-tense-verb>` (existing convention; D-16 records the alternative dotted style).

| Event | Room | When emitted (after commit of…) | `data` |
|-------|------|----------------------------------|--------|
| `board:created` | `workspace:{id}` | POST `/workspaces/:id/boards` | `BoardDto` |
| `board:updated` | `workspace:{id}` + `board:{id}` | PATCH `/boards/:id` | `BoardDto` |
| `board:deleted` | `workspace:{id}` + `board:{id}` | DELETE `/boards/:id` | `{ boardId }` |
| `list:created` | `board:{id}` | POST `/boards/:id/lists` | `ListDto` |
| `list:updated` | `board:{id}` | PATCH `/lists/:id` (title/archived) | `ListDto` |
| `list:moved` | `board:{id}` | PATCH `/lists/:id` (position) | `{ listId, position }` |
| `list:reordered` | `board:{id}` | list rebalance | `{ positions: { [listId]: number } }` |
| `list:deleted` | `board:{id}` | DELETE `/lists/:id` | `{ listId }` |
| `card:created` | `board:{id}` | POST `/lists/:id/cards` | `CardSummaryDto` |
| `card:updated` | `board:{id}` | PATCH `/cards/:id`, member/label/checklist changes, comment added/deleted | `CardSummaryDto & { archived }` |
| `card:moved` | `board:{from}` (+ `board:{to}` if different) | PATCH `/cards/:id/move` | `{ cardId, fromListId, toListId, fromBoardId, toBoardId, position }` |
| `card:reordered` | `board:{id}` | card rebalance in a list | `{ listId, positions: { [cardId]: number } }` |
| `card:deleted` | `board:{id}` | DELETE `/cards/:id` | `{ cardId, listId }` |
| `comment:created` | `board:{id}` | POST `/cards/:id/comments` | `CommentDto` |
| `comment:updated` | `board:{id}` | PATCH `/comments/:id` | `CommentDto` |
| `comment:deleted` | `board:{id}` | DELETE `/comments/:id` | `{ commentId, cardId }` |
| `member:removed` | `workspace:{id}` + removed user's sockets | DELETE `/workspaces/:id/members/:userId` | `{ userId }` |
| `notification:created` | `user:{recipientId}` | the change that notifies ([notifications.md → Triggers](../api/notifications.md#triggers)); due-soon ones are not sent live | `NotificationDto` |
| `notification:updated` | `user:{recipientId}` (except the tab that made the change) | PATCH `/notifications/:id`, POST `/notifications/read-all`, accepting an invite by id | `{ notificationId, read } \| { all: true }` |

For `notification:*` the envelope's `boardId` is the notification's board (or null) and `workspaceId` its workspace (null only for `notification:updated` with `all: true`, which spans the caller's workspaces); `actorId` is the user who caused it (the recipient, for `notification:updated`); `version` is `Date.now()`. The FE (`useNotificationsSocket`) puts a created notification at the top of `['notifications']` and refetches the unread count; a `notification:updated` updates the list and refetches the count.

Payload DTOs are the same schemas the REST API returns ([api/](../api/README.md)). A PATCH `/lists/:id` that renames and moves at once sends both `list:updated` and `list:moved` with the **same** `version`, so a client that applies `list:updated` (which already carries the settled position) must not expect to apply `list:moved` too; a create or move that rebalances also sends one `list:reordered`.

`card:updated` is the tile as it is now (`CardSummaryDto`, plus `archived` so the board can drop or bring back the tile). A PATCH sends it with the card's `updatedAt`. A real change to the card's labels or members, a checklist item added, ticked or deleted, a checklist deleted, a comment added or deleted, and an attachment uploaded or deleted (ATTACHMENTS-001) also send it (with `version` now, as those do not touch the card row); a repeated attach, a renamed item and the like send nothing. A card rebalance sends one `card:reordered` for its list. `card:moved` carries the new board's id in the envelope. Emitters: `Trello-Clone-BE/src/realtime/events/{boards,lists,members,cards,comments}.events.ts`; a failed read of the tile after a commit only loses that `card:updated` (logged).

## FE synchronization rules
| Concern | Rule |
|---------|------|
| Subscription | `useBoardSocket` joins `board:{id}` on mount and leaves on unmount; the workspace sidebar joins `workspace:{id}` for each of the caller's workspaces (`useWorkspacesSocket`), and the boards grid holds its workspace's room too (`useWorkspaceBoardsSocket`: `board:*` events and every join refetch `['boards', workspaceId]`) |
| Own actions | Already applied optimistically, so the server never sends a change back to the tab that made it: the FE sends its socket id as the `X-Socket-Id` header on every REST request, and `emitEvent` sends to the rooms `.except(thatSocket)` (BE `realtime/origin.ts`). The same user's other tabs still get the event, so `actorId` is not a reason to ignore one |
| Duplicates | Keep the last ~200 `eventId`s in an LRU; ignore repeats |
| Stale events | Ignore an event whose `version` ≤ the cached record's `updatedAt`. Delete events always apply |
| Moves across boards | `card:moved` names ids only; a card that arrives from another board (not in the cache) → `invalidateQueries(['board', toBoardId])` |
| Applying | Small changes (`*:updated`, `*:moved`, `*:created`) patch the cache with `queryClient.setQueryData(['board', id], …)`; `*:reordered` replaces positions; anything unexpected → `invalidateQueries(['board', id])`. Events that arrive while the board is being fetched are not patched (that answer may predate them and would overwrite the patch): the board is refetched once when that fetch settles, however many arrived |
| Optimistic conflicts | While one of this tab's own optimistic changes to the board is pending (the board's add/move scope, or a mutation keyed `boardChangeKey(boardId)`: renames, toggles on a card, checklists, comment counts), board events are not patched in; the change refetches the board when it settles, which brings them. The open card likewise skips its refetch while a change in its modal is pending. Comments are patched from the event (never refetched), so a refetch cannot drop or bring back a comment this tab is still adding or deleting |
| Reconnect | Every reconnect re-joins the rooms. Each successful board join (the first one too, since the board loads in parallel with it) refetches `['board', id]` and its activity, so changes made before the socket was in the room are not lost; each workspace join refetches `['boards', workspaceId]` the same way, and a reconnect refetches the workspace list and members (`['workspaces']`). A refused join's answer reaches the room's holders too |
| Removed from workspace | On `member:removed` for self: the workspace leaves the cached list with its members and invites (its pages redirect to `/` through `WorkspaceGate`, and the sidebar leaves its room), and a board page of that workspace drops the board and goes to `/`. For someone else: refetch the member list. A refused workspace join refetches the list. The tab that left on its own gets no event (X-Socket-Id); `useLeaveWorkspace` already forgets it |

Code: `Trello-Clone-FE/src/lib/socket.ts` (one connection for the app: `joinRoom`, `onEvent`, `onReconnect`, `createEventDedupe`; a refused handshake refreshes the token and reconnects), `features/boards/realtime.ts` (`applyBoardEvent`, the pure cache patch), and the hooks `useBoardSocket`, `useCardSocket` (open card modal), `useCommentsSocket`, `useWorkspaceBoardsSocket` (boards grid) and `useWorkspacesSocket` (sidebar, `features/workspaces`). Sign-out closes the connection. Tests replace the Socket.IO client with `FakeRealtime` ([testing.md](../development/testing.md)).

## Scaling / Redis adapter path
- Initially one API instance with the in-memory adapter. **No Redis.**
- With multiple instances: add `@socket.io/redis-adapter` in `realtime/socket.ts` and sticky sessions at the load balancer. Emitters and services **do not change** (principle 3). This requires an ADR and a DEPLOYMENT task update.
