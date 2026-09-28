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
The always-on rules live in [`.claude/rules/realtime.md`](../../rules/realtime.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

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
