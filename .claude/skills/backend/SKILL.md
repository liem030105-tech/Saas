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
The always-on rules live in [`.claude/rules/backend.md`](../../rules/backend.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

## References
Read the one that matches the work before writing code; they show the target shape. If the real code differs, the code wins: update the reference in the same PR.
- [`references/module-template.md`](references/module-template.md): routes → controller → service → schema skeleton (Express 5, Zod 4, validation)
- [`references/authorization.md`](references/authorization.md): `assertWorkspaceAccess` / `assertBoardAccess`, 404 vs 403, foreign-key checks
- [`references/prisma-patterns.md`](references/prisma-patterns.md): transactions, select/DTO mapping, Prisma errors, cursor pagination
- [`references/auth-tokens.md`](references/auth-tokens.md): access JWT, refresh rotation, reuse detection, cookie attributes (AUTH-001…004)

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
