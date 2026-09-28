# Backend Architecture

> **Domain:** structure and rules of `Trello-Clone-BE` (`@trello-clone/api`).
> API contracts: [docs/api](../api/README.md). Security: [security.md](security.md).

## Stack
Node.js 20 · Express · TypeScript · Prisma · PostgreSQL · Zod · jsonwebtoken + bcrypt · Socket.IO · Pino · Helmet · Multer

## Structure

```
Trello-Clone-BE/
├── src/
│   ├── config/              # env.ts (Zod-validated env), logger.ts, prisma.ts
│   ├── middlewares/         # authenticate, requireWorkspaceRole, validate, errorHandler, rateLimit
│   ├── lib/                 # AppError, position helpers, pure utilities
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── workspaces/
│   │   ├── boards/
│   │   ├── lists/
│   │   ├── cards/           # includes card labels, checklists, attachments
│   │   ├── comments/
│   │   └── billing/
│   ├── realtime/
│   │   ├── socket.ts        # server setup, auth middleware
│   │   ├── rooms.ts         # authorized join/leave
│   │   └── events/          # board / list / card / comment / workspace .events.ts
│   ├── app.ts               # builds the Express app (no listen, so tests can import it)
│   └── server.ts            # HTTP server + Socket.IO + listen
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/                   # test helpers, factories, DB setup for integration tests
├── package.json
└── tsconfig.json
```

## Module structure

```
modules/boards/
├── boards.routes.ts       # routes + middleware (authenticate, validate, requireRole)
├── boards.controller.ts   # req → service → res; no business logic
├── boards.service.ts      # business logic, transactions, realtime emits, activity log
├── boards.repository.ts   # (OPTIONAL, see below)
├── boards.schema.ts       # re-exports/extends shared schemas (params, query)
├── boards.types.ts        # (optional) module-internal types
└── boards.test.ts         # module unit/service tests
```

Dependency flow: **Route → Controller → Service → (Repository) → Prisma**

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| Route | Paths, middleware order | Contain logic |
| Controller | Translate HTTP ↔ service calls, choose status codes | Call Prisma, enforce business rules |
| Service | Business rules, plan limits, transactions, emits | Touch `req`/`res` |
| Repository | Complex or reused queries | Contain business rules |

### When is a repository necessary?
**Create one when at least one applies:**
- The query is complex (multiple joins, raw SQL, full-text search).
- The same query is used by ≥ 2 services (e.g. `findBoardWithAccess(userId, boardId)`).
- A DB-bound algorithm is involved (e.g. position rebalancing inside a transaction).

**Direct Prisma access from the service is fine** for simple CRUD modules (e.g. `users`, `comments`, `labels`).
Never create a repository just to wrap `prisma.x.findUnique`.

Expected repositories: `boards` (load board with lists/cards, search), `cards` (move), `workspaces` (membership queries shared by authorization). The generic container rebalance lives in `lib/rebalance.ts` (LIST-003).

The activity writer `logActivity(tx, …)` lives in `modules/boards/activity.ts` (BOARD-001) and is called inside the same transaction as the change it records.

## Cross-module communication
- Module A calls only module B's **service** (e.g. `cards.service` → `workspaces.service.assertMember()`).
- Never import another module's `*.repository.ts` or `*.controller.ts`.
- Avoid circular imports; move shared pieces to `lib/` or a small dedicated service.

## Error handling
- Services throw `AppError(code, httpStatus, message, details?)`; `errorHandler` maps it to the common format (see [api/README.md](../api/README.md)).
- Zod errors → `400 VALIDATION_ERROR`; Prisma `P2025` → `404 NOT_FOUND`; anything unexpected → `500 INTERNAL_ERROR`, fully logged, no stack trace sent to the client.

## Realtime emits (Post-MVP, REALTIME-001)
MVP services do not emit. From REALTIME-001 on, services emit **after the transaction commits**, through `realtime/events/*.events.ts`; never call `io.emit` directly from a service. See [realtime.md](realtime.md).
