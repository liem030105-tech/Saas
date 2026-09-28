# TaskBoard – Trello Clone SaaS · Project Blueprint

> This file is the **high-level blueprint**: product scope, architecture decisions, milestones.
> Detailed technical documentation lives in [`docs/`](docs/); Claude Code instructions live in [`.claude/`](.claude/CLAUDE.md).

---

## 1. Product overview

**TaskBoard** is a Kanban-style task management SaaS (Trello-like): workspace → board → list → card, drag and drop, realtime collaboration, Free/Pro plans.

- **Goal:** a production-quality learning/demo SaaS covering authentication, multi-tenancy, authorization, realtime, billing, testing, and CI.
- **Users:** individuals and small teams (startups, study groups, freelancers).
- **Developers:** one developer working with Claude Code; structured so a small team can join later.

### MVP scope
- Auth: register, login, refresh token, profile.
- Workspaces: CRUD, member invitations, roles OWNER / ADMIN / MEMBER / VIEWER.
- Boards / Lists / Cards: CRUD, archive, drag and drop with persisted ordering.
- Card details: markdown description, labels, members, due date, checklists, comments, activity log.

### Post-MVP
Realtime, attachments, search/filter, notifications, Free/Pro billing (Stripe test mode), board templates, dark mode.

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query (server state), Zustand (UI state), @dnd-kit, Tailwind CSS, shadcn/ui, React Hook Form, Zod, Axios, socket.io-client |
| Backend | Node.js 20, Express, TypeScript, Prisma, PostgreSQL, Zod, JWT + bcrypt, Socket.IO, Multer + S3/Cloudinary, Pino, Helmet |
| Shared | Zod schemas, TypeScript types, constants (`@trello-clone/shared`) |
| Monorepo | pnpm workspace |
| Quality | ESLint, Prettier, Vitest, Supertest, Playwright, GitHub Actions |
| Local infra | Docker Compose (PostgreSQL) |

---

## 3. Changes from the previous plan

### What changed
| Change | Why |
|--------|-----|
| `apps/web`, `apps/api` → `Trello-Clone-FE/`, `Trello-Clone-BE/` | FE/BE boundary is obvious at a glance; easier for Claude Code to scope changes |
| Technical details (schema, API, security, testing) moved into `docs/` | Single source of truth per topic; `plan.md` stays short |
| Added `.claude/` (CLAUDE.md, settings, 6 skills, 4 commands) | Safe, repeatable Claude Code workflow |
| Backend repositories are **selective**, not mandatory for every module | Avoid needless abstraction ([ADR-004](docs/decisions/README.md)) |
| Schema: added `RefreshToken`, `WorkspaceInvite`, `Card.boardId`, `ActivityType` / `SubscriptionStatus` enums, missing indexes | Previous plan referenced these features without models; cheaper authorization checks ([ADR-006](docs/decisions/README.md)) |
| Realtime: events carry `eventId` + `version`; emitters split by domain | Duplicate-event handling; Redis adapter can be added later |
| Roadmap split into Phase 0–9, each with its own Definition of Done | Incremental, controllable delivery |

### Intentionally NOT changed
- The 15-entity business model, roles, and permission matrix.
- `Float` position ordering with rebalancing.
- REST `/api/v1` and the unified error format.
- In-memory JWT access token + httpOnly refresh-token cookie.
- Socket.IO **without Redis** initially.
- Modular monolith; no microservices.

### Accepted trade-offs
- `Card.boardId` is denormalized and must be updated when a card moves across boards, in exchange for single-query authorization and realtime routing.
- pnpm workspace + shared package adds some configuration, in exchange for not defining types/schemas twice.
- Float positions need occasional rebalancing, in exchange for simpler logic than LexoRank.

---

## 4. Root folder structure

```
Trello-Clone/                 # = repository root
├── Trello-Clone-FE/          # @trello-clone/web    – frontend code only
├── Trello-Clone-BE/          # @trello-clone/api    – backend code only
├── packages/
│   └── shared/               # @trello-clone/shared – shared schemas/types/constants
├── docs/                     # detailed technical documentation
├── .claude/                  # Claude Code instructions and skills
├── .github/workflows/        # CI (created in Phase 0)
├── plan.md                   # this blueprint
├── README.md
├── docker-compose.yml        # local PostgreSQL
├── package.json              # root scripts (Phase 0)
├── pnpm-workspace.yaml       # (Phase 0)
└── .gitignore
```

| Folder | Responsibility | Must not contain |
|--------|----------------|------------------|
| `Trello-Clone-FE/` | UI, routing, API calls, client state | Business logic, real authorization, secrets |
| `Trello-Clone-BE/` | API, business logic, authorization, DB, realtime | UI code |
| `packages/shared/` | Zod schemas for API request/response, types, enums, constants | Business logic, DB access, React/Express code |
| `docs/` | Technical documentation | Runnable code |
| `.claude/` | Claude Code instructions | Technical docs duplicated from `docs/` |

**No `docker/` folder**: there is a single compose file at the root, and each package owns its Dockerfile ([ADR-003](docs/decisions/README.md)).

Internal structure: [FE](docs/architecture/frontend.md) · [BE](docs/architecture/backend.md) · [shared & monorepo](docs/architecture/overview.md).

---

## 5. Single source of truth

| Information | Lives in |
|-------------|----------|
| Product scope, major decisions, roadmap | `plan.md` |
| Architecture and per-layer rules | `docs/architecture/` |
| API contracts | `docs/api/` (once code exists: Zod schemas in `packages/shared`) |
| Database schema | `docs/database/schema.md` (once code exists: `Trello-Clone-BE/prisma/schema.prisma`) |
| Setup, conventions, testing | `docs/development/` |
| Deployment | `docs/deployment/` |
| Why decisions were made | `docs/decisions/README.md` |
| Rules for Claude Code | `.claude/CLAUDE.md` and `.claude/skills/` |

Once real code exists, **code is the source of truth** and documentation must be kept in sync with it.

---

## 6. Key architecture decisions

Summary; full reasoning in [`docs/decisions/README.md`](docs/decisions/README.md).

1. **Modular monolith**: one backend split into domain modules. No microservices.
2. **pnpm monorepo** with three packages: `@trello-clone/web`, `@trello-clone/api`, `@trello-clone/shared`.
3. **No `docker/` folder.**
4. **Repositories only where they earn their place.**
5. **TanStack Query for server state; Zustand for UI state only.**
6. **Multi-tenancy:** every query is scoped to the user's workspaces; authorization is always enforced on the backend.
7. **Realtime:** Socket.IO rooms per board, domain events, upgrade path to a Redis adapter.
8. **Float positions** for list/card ordering.
9. **Auth:** short-lived access token + rotating refresh token with reuse detection.
10. **Claude Code:** CLAUDE.md is the primary instruction file; skills exist only for specialized workflows.

---

## 7. Roadmap

> Durations are **estimates** for one developer working with Claude Code and may change. Every phase merges via PR with green CI.

### Phase 0 — Project foundation (~2 days, estimate)
- **Goal:** `pnpm dev` runs FE + BE; CI is green.
- **BE:** Express + TS, `/health`, Zod-validated env config, logger, error middleware.
- **FE:** Vite + React + TS, Tailwind, shadcn/ui, Router, QueryClient.
- **DB:** Docker Compose Postgres, initial `schema.prisma` (User only).
- **Shared:** package created, exports one sample schema.
- **Tests:** Vitest runs in all three packages.
- **Docs:** `development/setup.md` matches reality.
- **DoD:** clone → `pnpm i && pnpm dev` works; CI runs lint + typecheck + test.

### Phase 1 — Authentication (~3 days)
- **BE:** register / login / refresh / logout / me, `RefreshToken` model, rotation, rate limiting.
- **FE:** Login/Register pages, axios interceptor, `ProtectedRoute`.
- **DB:** migrations for User, RefreshToken.
- **Tests:** unit (hashing, tokens), integration (auth flows, reuse detection), E2E register/login.
- **Docs:** `api/authentication.md`.
- **DoD:** session survives a page reload; a reused token revokes its whole family.

### Phase 2 — Workspaces & authorization (~3 days)
- **BE:** workspace CRUD, members, invites, `requireWorkspaceRole` middleware.
- **FE:** workspace sidebar, members page, invite acceptance flow.
- **DB:** Workspace, WorkspaceMember, WorkspaceInvite.
- **Tests:** role matrix (4 roles × actions), tenant isolation.
- **Docs:** `api/workspaces.md`.
- **DoD:** a non-member gets 404 for every resource in the workspace.

### Phase 3 — Boards / Lists / Cards (~5 days)
- **BE:** board/list/card CRUD, move API, position algorithm + rebalancing.
- **FE:** board page, @dnd-kit drag and drop, optimistic updates with rollback.
- **DB:** Board, List, Card (with `boardId`), Label.
- **Tests:** position unit tests, move integration tests, drag-and-drop E2E.
- **Docs:** `api/boards.md`, `api/lists.md`, `api/cards.md`.
- **DoD:** order is preserved after reload; rapid consecutive drags never corrupt order.

### Phase 4 — Card details (~4 days)
- Labels, members, due date, checklists, comments (sanitized markdown), activity log.
- **DoD:** complete card modal; `/b/:boardId/c/:cardId` is shareable.

### Phase 5 — Realtime (~4 days)
- **BE:** Socket.IO with connection authentication, room authorization, emit after commit.
- **FE:** `useBoardSocket` syncing the TanStack Query cache, duplicate-event filtering, invalidate on reconnect.
- **Tests:** socket-client integration tests, two-browser E2E.
- **Docs:** `architecture/realtime.md`.
- **DoD:** two tabs sync within 1 second; data is correct after a disconnect/reconnect.

### Phase 6 — Attachments / search / notifications (~4 days)
- Uploads with type and size validation, card covers, card search and filters, in-app notifications.

### Phase 7 — Billing (~3 days)
- Stripe Checkout + Customer Portal + signature-verified webhook, plan limit checks (`402 PLAN_LIMIT_REACHED`).
- **Docs:** `api/billing.md`.

### Phase 8 — Testing & CI hardening (~3 days)
- Fill test gaps up to the minimum bar, E2E in CI, coverage reporting.

### Phase 9 — Production deployment (~2 days)
- Staging + production deploys, migrations on deploy, error monitoring.
- **Docs:** `deployment/staging.md`, `deployment/production.md`.

---

## 8. Definition of Done (every feature)

- [ ] Code lives in the owning folder; no unrelated modules touched.
- [ ] Authorization and tenant isolation enforced on the backend, with tests.
- [ ] Tests meet the minimum bar in [`docs/development/testing.md`](docs/development/testing.md).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.
- [ ] Schema changes include a Prisma migration; API changes update `docs/api/`.
- [ ] No secrets in code or in the FE bundle.
- [ ] Diff self-reviewed before merge; PR describes the change clearly.

---

## 9. Documentation index

- Architecture: [overview](docs/architecture/overview.md) · [frontend](docs/architecture/frontend.md) · [backend](docs/architecture/backend.md) · [database](docs/architecture/database.md) · [realtime](docs/architecture/realtime.md) · [security](docs/architecture/security.md)
- API: [README](docs/api/README.md)
- Database: [schema](docs/database/schema.md) · [relationships](docs/database/relationships.md)
- Development: [setup](docs/development/setup.md) · [coding conventions](docs/development/coding-conventions.md) · [testing](docs/development/testing.md) · [troubleshooting](docs/development/troubleshooting.md)
- Deployment: [local](docs/deployment/local.md) · [staging](docs/deployment/staging.md) · [production](docs/deployment/production.md)
- Decisions: [ADR log](docs/decisions/README.md)
- Claude Code: [CLAUDE.md](.claude/CLAUDE.md)
