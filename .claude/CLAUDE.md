# CLAUDE.md – TaskBoard (Trello Clone SaaS)

The **primary** project-level instruction file for Claude Code. It holds only core rules; details live in `docs/` and `.claude/skills/`.
Precedence on conflict: for **how to work**, CLAUDE.md > `.claude/rules` > skills > docs; for **what the system does**, code (once it exists) > `plan.md` and ADRs > technical docs > task specs. Any conflict is a bug: fix the losing side in the same PR.

## 1. Project
Trello-style Kanban SaaS: workspace → board → list → card, role-based access, realtime, Free/Pro billing.
pnpm monorepo, modular monolith. Blueprint: `plan.md`. Decision rationale: `docs/decisions/README.md`.
Stack major versions are fixed in `plan.md` §3 (ADR-015): write code for those versions (e.g. Express 5, Prisma 7, React Router 7, Tailwind 4, Zod 4), never for older APIs.

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
- **Shared** contains only schemas, types, constants, and tiny pure formulas (position helpers, ADR-017) that **both sides use**. No business logic, Prisma, React, or Express code.
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
- A finished task sets its status to Done in `docs/tasks/README.md`.
- Never state an unconfirmed value as decided; reference its `D-xx` item instead.

## 8. Git
- Conventional Commits (`feat(cards): …`). One concern per PR, ideally under ~400 lines.
- Never commit `.env` or build output. Never force-push to `main`.

## 9. Rules for Claude Code
Sections 2–8 apply everywhere; area rules load automatically from `.claude/rules/` when you touch matching files.
1. Inspect the relevant module (code + docs) **before** modifying it.
2. Stay inside the task: no unrelated modules, refactors, renames, or dependency bumps.
3. FE and BE changes stay in their own folder; touch `packages/shared` only for contracts both sides use.
4. A new dependency needs a justification in the PR, or ask the user first.
5. Never duplicate business logic between FE and BE; the BE is the source of truth.
6. Prefer small, incremental changes; run `pnpm typecheck && pnpm lint && pnpm test` after meaningful changes.
7. Verify user-visible changes in the running app (`run-app` skill), not only through tests.

When scope or architecture is unclear: **stop and ask**; do not guess.

## 10. Workflow
Implementation work starts from a task spec: pick the next task per `docs/tasks/README.md` and run `/implement <TASK-ID>`. Do not implement anything that has no task spec, and do not start a task that is blocked by an open `D-xx` in `docs/decisions/DECISIONS-REQUIRED.md`. Acceptance is always `docs/development/definition-of-done.md`.

1. Read requirements (the task spec) → 2. Read relevant docs → 3. Identify affected FE/BE/shared modules → 4. Plan (`/plan`)
→ 5. Implement BE → 6. Update shared schemas/types if needed → 7. Implement FE → 8. Add/update tests
→ 9. `pnpm typecheck` → 10. `pnpm lint` → 11. `pnpm test` → 12. Update docs → 13. Review the diff (`/check-diff`) → 14. Summarize changes.

Commands: `/next`, `/plan`, `/implement`, `/test`, `/check-diff`, `/decide` (in `.claude/commands/`). Built-in `/security-review` is also run for auth, workspace, and billing changes.

## 11. Skills

| Skill | Use when |
|-------|----------|
| `backend` | Changing code in `Trello-Clone-BE/src` (modules, middleware, services) |
| `frontend` | Changing code in `Trello-Clone-FE/src` |
| `database` | Changing `schema.prisma`, migrations, seeds, complex queries |
| `realtime` | Changing Socket.IO (BE `realtime/`) or FE socket synchronization |
| `testing` | Writing/fixing tests, debugging failing tests |
| `review-checklist` | Reviewing a diff/PR before commit or merge |
| `run-app` | Starting the database, API, and web app to check a change in the browser |

Subagent `code-reviewer` (`.claude/agents/`) reviews diffs in a fresh context for `/check-diff` and `/implement`. Hooks in `.claude/hooks/` enforce §4, §5 and §8 mechanically (ADR-014); if a hook blocks a call, follow its message; never work around it.

## 12. Commands (available after Phase 0)
```bash
pnpm dev | pnpm typecheck | pnpm lint | pnpm test | pnpm build
pnpm --filter @trello-clone/api db:migrate | db:seed | db:studio
pnpm --filter @trello-clone/web test:e2e
```

## 13. Current status
Progress lives only in `docs/tasks/README.md`: the next task is the first **Todo** row whose dependencies are Done.
