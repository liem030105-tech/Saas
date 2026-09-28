---
name: realtime
description: Use when adding or changing Socket.IO behavior – server setup, socket authentication, room authorization, event emitters in Trello-Clone-BE/src/realtime, realtime event types in packages/shared, or FE socket hooks that sync the TanStack Query cache.
---

# Skill: Realtime (Socket.IO)

## Purpose
Keep realtime consistent end to end: authenticated connections, authorized rooms, typed domain events, and a FE cache that converges after duplicates and reconnects.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/architecture/realtime.md` – rooms, naming, payload shape, de-duplication, reconnect, scaling
2. `packages/shared/src/constants` (event names) and `types` (payloads)
3. The emitting service and the FE `useBoardSocket` hook

## Rules
- Mutations go through REST only; clients may emit only `board:join` / `board:leave`.
- Event names follow `<domain>:<past-tense-verb>` and are declared once in shared constants.
- Every payload is `RealtimeEvent<T>` with `eventId`, `type`, `boardId`, `actorId`, `version`, `data`.
- Emit only from `realtime/events/<domain>.events.ts`, called by services **after** the transaction commits.
- Joining a room always runs `assertBoardAccess`; removing a member evicts their sockets.
- FE: ignore own events (`actorId`), de-duplicate by `eventId`, ignore stale `version`, invalidate board queries on reconnect.
- Do not add Redis or other infrastructure; keep the adapter swap confined to `socket.ts` (see ADR-009).

## May modify
- `Trello-Clone-BE/src/realtime/**` and emit calls inside services
- `packages/shared/src/constants/events.ts`, `packages/shared/src/types/realtime.ts`
- `Trello-Clone-FE/src/lib/socket.ts`, socket hooks inside `Trello-Clone-FE/src/features/**`
- `docs/architecture/realtime.md`

## Must never modify
- REST contracts to route mutations through sockets
- Prisma schema (use the `database` skill)

## Done checklist
- [ ] Integration test with a socket client: unauthorized connect rejected, unauthorized join rejected, event received after a REST mutation
- [ ] FE hook tests: duplicate event ignored, own event ignored, reconnect invalidates
- [ ] Event added to `docs/architecture/realtime.md` if it is a new type
