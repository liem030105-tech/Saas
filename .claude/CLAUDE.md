# CLAUDE.md – TaskBoard (Trello Clone SaaS)

The **primary** project-level instruction file for Claude Code. It holds only core rules; details live in `docs/` and `.claude/skills/`.
Precedence on conflict: **CLAUDE.md > skill > docs**. If docs disagree with code, fix the docs in the same PR.

## 1. Project
Trello-style Kanban SaaS: workspace → board → list → card, role-based access, realtime, Free/Pro billing.
pnpm monorepo, modular monolith. Blueprint: `plan.md`. Decision rationale: `docs/decisions/README.md`.

## 2. Folder ownership

| Folder | Package | Owns | Docs |
|--------|---------|------|------|
| `Trello-Clone-FE/` | `@trello-clone/web` | React UI, routing, API calls, UI state | `docs/architecture/frontend.md` |
| `Trello-Clone-BE/` | `@trello-clone/api` | REST API, business logic, authorization, Prisma, Socket.IO | `docs/architecture/backend.md` |
| `packages/shared/` | `@trello-clone/shared` | API Zod schemas, types, enums, constants | `docs/architecture/overview.md` |
| `docs/` | – | Technical documentation | – |
| `.claude/` | – | Claude Code instructions | – |

## 3. Architecture rules
- **FE and BE never import each other.** Both may import `@trello-clone/shared`; shared imports neither.
- **Shared** contains only schemas, types, and constants that **both sides use**. No business logic, Prisma, React, or Express code.
- **BE:** Route → Controller → Service → (Repository) → Prisma. Controllers never call Prisma. Repositories only for complex or reused queries. Modules call other modules only through their **service**.
- **FE:** feature-based. Domain components live in `features/<x>/components`, not `components/`. Server state uses **TanStack Query**; Zustand is for UI state only.
- **Realtime:** all mutations go through REST. Services emit after commit via `realtime/events/*`.
- **No microservices.** No Redis, queues, or new infrastructure without an ADR.

## 4. Database
- Every schema change edits `prisma/schema.prisma` and adds a migration (`prisma migrate dev --name …`). Never modify a merged migration.
- Update `docs/database/schema.md` in the same PR.
- Every lookup by id checks workspace membership. Use transactions for multi-record changes.

## 5. Security
- Authorization is **always enforced on the backend**. Non-members get 404; insufficient role gets 403.
- Validate all input with Zod. Never return stack traces.
- No secrets in code or in the FE (`VITE_*` is public). Never read or edit real `.env` files; only `.env.example`.
- Details: `docs/architecture/security.md`.

## 6. Testing
New features ship with tests per `docs/development/testing.md`. New endpoints cover 5 cases: happy path, validation, 401, non-member (404), insufficient role (403).
Never skip or delete tests to make CI green.

## 7. Documentation
- API change → update `docs/api/<module>.md`.
- Architecture change → update `docs/architecture/*` and add an ADR.
- Setup change → update `docs/development/setup.md`.
- Never duplicate content across files; link to the existing one.

## 8. Git
- Conventional Commits (`feat(cards): …`). One concern per PR, ideally under ~400 lines.
- Never commit `.env` or build output. Never force-push to `main`.

## 9. Rules for Claude Code
1. Inspect the relevant module (code + docs) **before** modifying it.
2. Do not modify modules unrelated to the task.
3. Respect the folder ownership in section 2.
4. FE changes stay inside `Trello-Clone-FE/` unless shared code is genuinely required.
5. BE changes stay inside `Trello-Clone-BE/` unless shared code is genuinely required.
6. Database changes update both the Prisma schema and a migration.
7. API changes update `docs/api/`.
8. Shared schema changes must consider both FE and BE (run the repo-wide typecheck).
9. New features include tests.
10. Do not add dependencies without a stated justification in the PR or asking the user.
11. Do not refactor unrelated code while implementing a feature.
12. Do not create microservices.
13. Do not duplicate business logic between FE and BE; the BE is the source of truth.
14. Do not put server state in Zustand.
15. Do not bypass backend authorization checks.
16. Never expose secrets in frontend code.
17. Do not modify `.env` files containing real secrets.
18. Prefer small, incremental changes.
19. Run `pnpm typecheck && pnpm lint && pnpm test` after meaningful changes.
20. Update documentation when the architecture or public API changes.

When scope or architecture is unclear: **stop and ask**; do not guess.

## 10. Workflow
1. Read requirements → 2. Read relevant docs → 3. Identify affected FE/BE/shared modules → 4. Plan (`/plan`)
→ 5. Implement BE → 6. Update shared schemas/types if needed → 7. Implement FE → 8. Add/update tests
→ 9. `pnpm typecheck` → 10. `pnpm lint` → 11. `pnpm test` → 12. Update docs → 13. Review the diff (`/review`) → 14. Summarize changes.

Commands: `/plan`, `/implement`, `/test`, `/review` (in `.claude/commands/`).

## 11. Skills

| Skill | Use when |
|-------|----------|
| `backend` | Changing code in `Trello-Clone-BE/src` (modules, middleware, services) |
| `frontend` | Changing code in `Trello-Clone-FE/src` |
| `database` | Changing `schema.prisma`, migrations, seeds, complex queries |
| `realtime` | Changing Socket.IO (BE `realtime/`) or FE socket synchronization |
| `testing` | Writing/fixing tests, debugging failing tests |
| `code-review` | Reviewing a diff/PR before commit or merge |

## 12. Commands (available after Phase 0)
```bash
pnpm dev | pnpm typecheck | pnpm lint | pnpm test | pnpm build
pnpm --filter @trello-clone/api db:migrate | db:seed | db:studio
pnpm --filter @trello-clone/web test:e2e
```

## 13. Current status
Architecture and documentation are done. **No application code yet.** Next step: Phase 0 in `plan.md`.
