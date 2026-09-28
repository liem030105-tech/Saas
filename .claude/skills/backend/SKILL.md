---
name: backend
description: Use when creating or modifying backend code in Trello-Clone-BE/src (modules, routes, controllers, services, repositories, middleware, config), adding or changing /api/v1 REST endpoints, or implementing server-side authorization and plan-limit checks.
---

# Skill: Backend (Trello-Clone-BE)

## Purpose
Keep BE code consistent with the modular-monolith structure, always enforce authorization and tenant isolation, and match the API contract.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/architecture/backend.md` – module structure, when a repository is warranted
2. `docs/api/README.md` + `docs/api/<module>.md` – API contract, error codes
3. `docs/architecture/security.md` – when touching auth, uploads, or webhooks
4. The target module's code: `routes → controller → service → repository`

## Rules
- A new module has `<m>.routes.ts`, `<m>.controller.ts`, `<m>.service.ts`, `<m>.test.ts`. Add `<m>.repository.ts` **only** when backend.md's criteria are met.
- Controller: take validated input → call service → `res.status(x).json({ data })`. No Prisma, no `try/catch` that swallows errors.
- Service: throw `AppError` with codes from `@trello-clone/shared`. Never touch `req`/`res`.
- Every non-public route: `authenticate` → `validate(schema)` → authorization (`requireWorkspaceRole` or `assertBoardAccess` in the service).
- Non-member → `NOT_FOUND`; member without the role → `FORBIDDEN`.
- Client-supplied foreign keys (listId, labelId, userId) must belong to the same board/workspace.
- Multi-record changes use `prisma.$transaction`; log `Activity` in the same transaction; emit realtime **after commit** via `realtime/events/*`.
- Creating plan-limited resources calls `billing.service.assertWithinLimit` first.
- Request/response Zod schemas come from `@trello-clone/shared`; BE-only schemas (e.g. params) live in `<m>.schema.ts`.

## May modify
- `Trello-Clone-BE/src/**`, `Trello-Clone-BE/tests/**`
- `packages/shared/src/schemas|types|constants/**` **only** when the API contract changes (check FE impact)
- `docs/api/<module>.md`, `docs/architecture/backend.md`

## Must never modify
- `Trello-Clone-FE/**`
- `Trello-Clone-BE/prisma/**` – use the `database` skill
- `.env*` (except `.env.example`), merged `prisma/migrations/**`

## Done checklist
- [ ] Endpoint has all 5 integration cases (see the `testing` skill)
- [ ] `docs/api/<module>.md` matches the code (routes, authorization, errors)
- [ ] No `any`, no `console.log`
- [ ] `pnpm --filter @trello-clone/api typecheck`, `lint`, `test` pass
