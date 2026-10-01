---
paths:
  - "Trello-Clone-BE/src/realtime/**"
  - "Trello-Clone-FE/src/lib/socket.ts"
  - "**/*socket*.ts"
  - "**/*socket*.tsx"
---

# Realtime (Socket.IO) rules

Loaded automatically when Claude reads matching files. Procedures, references, and checklists: the `realtime` skill.

- Mutations go through REST only; clients may emit only `board:join` / `board:leave` and `workspace:join` / `workspace:leave`.
- Event names follow `<domain>:<past-tense-verb>` and are declared once in shared constants.
- Every payload is `RealtimeEvent<T>` with `eventId`, `type`, `boardId`, `actorId`, `version`, `data`.
- Emit only from `realtime/events/<domain>.events.ts`, called by services **after** the transaction commits.
- Joining a room always runs `assertBoardAccess` (board rooms) or `assertWorkspaceAccess` (workspace rooms); removing a member evicts their sockets.
- Own changes are not echoed: the FE sends `X-Socket-Id`, the server emits `.except()` that socket (never filter by `actorId`, other tabs need it). FE: de-duplicate by `eventId`, ignore stale `version`, invalidate board queries on reconnect.
- Do not add Redis or other infrastructure; keep the adapter swap confined to `socket.ts` (see ADR-009).
