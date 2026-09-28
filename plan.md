# TaskBoard – Trello Clone SaaS · Project Blueprint

> **High-level blueprint:** product scope, architecture decisions, roadmap. Detailed specifications live in [`docs/`](docs/); the implementation backlog lives in [`docs/tasks/`](docs/tasks/README.md); Claude Code instructions live in [`.claude/`](.claude/CLAUDE.md).
> Document hierarchy on conflict: **plan.md → ADRs → technical docs → task specs → code**.

---

## 1. Product overview

**TaskBoard** is a Kanban-style task management SaaS (Trello-like): workspace → board → list → card, with drag and drop, team roles, and (post-MVP) realtime collaboration and Free/Pro plans.

- **Goal:** a production-quality learning/demo SaaS covering authentication, multi-tenancy, authorization, realtime, billing, testing, and CI.
- **Users:** individuals and small teams (startups, study groups, freelancers).
- **Developers:** one developer working with Claude Code; structured so a small team can join later.

## 2. Scope: MVP vs. Post-MVP

| | Phases | Delivers |
|--|--------|----------|
| **MVP** | 0 → 4 | Project foundation · Authentication (register, login, refresh, logout, profile) · Workspaces with roles, members, invitations · Boards / Lists / Cards with drag-and-drop ordering · Card details (description, due date, labels, members, checklists, comments, activity log) |
| **Post-MVP** | 5 → 9 | Realtime · Attachments & covers · Search/filters · Notifications · Billing & plan limits · Testing hardening · Production deployment |

**Explicitly not in the MVP:** realtime updates (clients refetch), plan limits (D-11), email delivery (invite links are shared manually, D-18), file uploads.
**Unphased ideas** (templates, dark mode, favorites, landing/pricing pages): awaiting **D-08**.

## 3. Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query (server state), Zustand (UI state), @dnd-kit, Tailwind CSS, shadcn/ui, React Hook Form, Zod, Axios, socket.io-client (Phase 5) |
| Backend | Node.js 20, Express, TypeScript, Prisma, PostgreSQL, Zod, JWT + bcrypt, Pino, Helmet; Socket.IO (Phase 5), Multer (Phase 6), Stripe (Phase 7) |
| Shared | `@trello-clone/shared`: Zod schemas, types, constants |
| Monorepo | pnpm workspace |
| Quality | ESLint, Prettier, Vitest, Supertest, Playwright, GitHub Actions |
| Local infra | Docker Compose (PostgreSQL) |

## 4. Root folder structure

```
Trello-Clone/                 # = repository root
├── Trello-Clone-FE/          # @trello-clone/web    – frontend code only
├── Trello-Clone-BE/          # @trello-clone/api    – backend code only
├── packages/shared/          # @trello-clone/shared – shared schemas/types/constants
├── docs/                     # technical specs, tasks, decisions
├── .claude/                  # Claude Code instructions, skills, commands
├── .github/workflows/        # CI (FOUNDATION-006)
├── plan.md · README.md · docker-compose.yml · package.json · pnpm-workspace.yaml · .gitignore
```

| Folder | Responsibility | Must not contain |
|--------|----------------|------------------|
| `Trello-Clone-FE/` | UI, routing, API calls, client state | Business rules, real authorization, secrets |
| `Trello-Clone-BE/` | API, business rules, authorization, DB, realtime | UI code |
| `packages/shared/` | API schemas, types, enums, constants used by both sides | Business logic, DB access, React/Express code |
| `docs/` | Specifications, tasks, decisions | Runnable code |
| `.claude/` | Claude Code instructions | Copies of `docs/` content |

Internal structure: [overview & monorepo](docs/architecture/overview.md) · [frontend](docs/architecture/frontend.md) · [backend](docs/architecture/backend.md).

## 5. Single source of truth

| Information | Lives in |
|-------------|----------|
| Scope, decisions, roadmap | `plan.md` |
| Decision rationale / open decisions | `docs/decisions/README.md` / `docs/decisions/DECISIONS-REQUIRED.md` |
| Architecture rules | `docs/architecture/` |
| API contracts, authorization model | `docs/api/` (Zod schemas in `packages/shared` once code exists) |
| Database | `docs/database/` (`prisma/schema.prisma` once code exists) |
| Implementation units | `docs/tasks/` |
| Setup, conventions, testing, Definition of Done | `docs/development/` |
| Claude Code rules | `.claude/CLAUDE.md`, `.claude/skills/` |

## 6. Key architecture decisions
Full rationale: [ADR log](docs/decisions/README.md).

1. Modular monolith; no microservices (ADR-001).
2. pnpm monorepo with `Trello-Clone-FE`, `Trello-Clone-BE`, `packages/shared` (ADR-002); no `docker/` folder (ADR-003).
3. Repositories only where they earn their place (ADR-004).
4. TanStack Query for server state; Zustand for UI state only (ADR-005).
5. Multi-tenancy by workspace; authorization always on the backend; non-members get 404 (ADR-007).
6. Float positions with rebalancing for ordering (ADR-008).
7. Realtime via Socket.IO rooms per board, REST-only mutations, emit after commit (ADR-009).
8. In-memory access token + rotating refresh token in an httpOnly cookie (ADR-010).
9. CLAUDE.md + 6 skills + 4 commands; task-spec-driven implementation (ADR-011, ADR-013).

## 7. Roadmap

Durations are **estimates** for one developer with Claude Code. Every task merges via PR with green CI. Task details and the deterministic order: [docs/tasks/README.md](docs/tasks/README.md).

| Phase | Scope | Tasks | Phase acceptance (on `main`) | Estimate |
|-------|-------|-------|------------------------------|----------|
| 0 Foundation | Monorepo, BE/FE/DB bootstrap, shared package, CI | FOUNDATION-001…006 | Clone → `pnpm i && pnpm dev` works; `ci` check green and required | ~2 days |
| 1 Authentication | Register, login, refresh rotation, logout, profile, route protection | AUTH-001…006 | Session survives reload; a replayed refresh token kills the session; E2E 1 green | ~3 days |
| 2 Workspaces & authorization | Workspaces, members, invitations, RBAC, tenant isolation | WORKSPACE-001…006 | Role matrix and tenant-isolation suites green; E2E 2 green | ~3 days |
| 3 Boards / Lists / Cards | Board CRUD, list/card CRUD, ordering, move API, drag and drop | BOARD-001…002, LIST-001…003, CARD-001…004 | Order persists after reload under repeated drags; E2E 3, 4, 6 green | ~5 days |
| 4 Card details | Labels, members, checklists, comments, activity feed | CARD-005 | Complete card modal; E2E 5 green → **MVP done** | ~4 days |
| 5 Realtime | Socket.IO rooms/events, FE cache sync | REALTIME-001 | Two browsers converge; E2E 7 green | ~4 days |
| 6 Attachments / search / notifications | Uploads & covers, board search, notifications | ATTACHMENTS-001, SEARCH-001, NOTIFICATIONS-001 | Per task acceptance | ~4 days |
| 7 Billing | Stripe, plan limits, pricing/landing | BILLING-001 | Test-mode upgrade/downgrade works; limits return 402 | ~3 days |
| 8 Testing hardening | Gap audit, E2E in CI, coverage | TESTING-001 | Zero baseline gaps; `e2e` required | ~3 days |
| 9 Production | Staging + production, monitoring, backups | DEPLOYMENT-001 | Production usable end-to-end | ~2 days |

## 8. Definition of Done
Every task satisfies the single canonical [Definition of Done](docs/development/definition-of-done.md): architecture boundaries, backend authorization, tenant isolation, validation, tests per the [test matrix](docs/development/testing.md#when-each-test-type-is-required), typecheck, lint, updated docs, no secrets, no unrelated refactoring, green CI.

## 9. Unresolved decisions
Open questions needing human approval are tracked in [DECISIONS-REQUIRED.md](docs/decisions/DECISIONS-REQUIRED.md) (`D-01`…`D-23`). Tasks may proceed on proposed defaults unless an item is marked **blocking** for that task. Currently blocking: D-06 (WORKSPACE-001 register hook), D-09 (NOTIFICATIONS-001), D-13 (BILLING-001), D-20 (ATTACHMENTS-001), D-21 and D-22 (DEPLOYMENT-001).

## 10. Documentation index
- Architecture: [overview](docs/architecture/overview.md) · [frontend](docs/architecture/frontend.md) · [backend](docs/architecture/backend.md) · [database](docs/architecture/database.md) · [realtime](docs/architecture/realtime.md) · [security](docs/architecture/security.md)
- API: [conventions & authorization](docs/api/README.md) · [authentication](docs/api/authentication.md) · [workspaces](docs/api/workspaces.md) · [boards](docs/api/boards.md) · [lists](docs/api/lists.md) · [cards](docs/api/cards.md) · [billing](docs/api/billing.md)
- Database: [schema](docs/database/schema.md) · [relationships & ordering](docs/database/relationships.md)
- Development: [setup](docs/development/setup.md) · [conventions](docs/development/coding-conventions.md) · [testing](docs/development/testing.md) · [Definition of Done](docs/development/definition-of-done.md) · [troubleshooting](docs/development/troubleshooting.md)
- Deployment: [local](docs/deployment/local.md) · [staging](docs/deployment/staging.md) · [production](docs/deployment/production.md)
- Tasks: [backlog & dependency graph](docs/tasks/README.md) · [template](docs/tasks/TASK-TEMPLATE.md)
- Decisions: [ADR log](docs/decisions/README.md) · [decisions required](docs/decisions/DECISIONS-REQUIRED.md)
- Claude Code: [CLAUDE.md](.claude/CLAUDE.md)
