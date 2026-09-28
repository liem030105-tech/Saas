# Realtime Architecture

> **Domain:** Socket.IO connections, rooms, events, and FE cache synchronization.
> Event names and payload types are code in `packages/shared/src/constants` and `types`.

## Structure (BE)
```
realtime/
├── socket.ts          # creates the Server, auth middleware, adapter
├── rooms.ts           # board:join / board:leave with authorization
└── events/
    ├── board.events.ts
    ├── list.events.ts
    ├── card.events.ts
    ├── comment.events.ts
    └── workspace.events.ts
```
Each `*.events.ts` exports typed emitter functions, e.g. `emitCardMoved(boardId, payload, actorSocketId?)`. Services call these; they never touch `io` directly.

## Connection authentication
- The client sends the access token in `auth: { token }` on connect.
- An `io.use()` middleware verifies the JWT and sets `socket.data.userId`; invalid/expired → `next(new Error('UNAUTHORIZED'))`.
- When the access token expires, the client refreshes it and **reconnects** with the new token. The server never extends tokens.

## Room authorization
- Rooms: `board:<boardId>` and `workspace:<workspaceId>` (for board created/renamed/deleted).
- `board:join { boardId }` → server runs `assertBoardAccess(userId, boardId, 'VIEWER')` before `socket.join`; if not allowed, returns an error ack and does not join.
- When a user is removed from a workspace, the server calls `socketsLeave` to evict that user's sockets from related rooms.

## Event naming
`<domain>:<past-tense-verb>`: `board:updated`, `list:created`, `list:moved`, `card:created`, `card:updated`, `card:moved`, `card:deleted`, `comment:created`, `member:removed`.
Client → server events are limited to `board:join` and `board:leave`. **All mutations go through REST**; sockets only broadcast changes.

## Payload
```ts
interface RealtimeEvent<T> {
  eventId: string;      // uuid, for de-duplication
  type: string;         // 'card:moved'
  boardId: string;
  actorId: string;      // user who made the change
  version: number;      // record updatedAt as epoch ms
  data: T;              // e.g. { cardId, fromListId, toListId, position }
}
```

## FE synchronization
- `useBoardSocket(boardId)` joins on mount and leaves on unmount.
- **Own actions** use optimistic updates via mutations; events with `actorId === currentUser` are ignored (the cache is already correct).
- **Other users' actions:** small changes (move, update) patch the cache with `queryClient.setQueryData(['board', id], …)`; complex changes use `invalidateQueries`.
- **Duplicate handling:** keep processed `eventId`s in an LRU (~200 entries); ignore events whose `version` ≤ the cached version.
- **Reconnect:** on every reconnect after the first connect → re-join rooms → `invalidateQueries(['board', id])` to recover any missed events.

## Scaling to multiple instances
- Initially one instance with the default in-memory adapter.
- For multiple instances: add `@socket.io/redis-adapter` in `socket.ts` and enable sticky sessions at the load balancer. Services and emitters **do not change**, because all emits go through `events/*`.
- Do not add Redis until multiple instances are actually deployed.
