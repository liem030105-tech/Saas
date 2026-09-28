# Architecture Decision Records (ADR)

> **Domain:** architecture decisions and **why** they were made. Append new ADRs at the end. Never edit an accepted ADR; to change a decision, add a new ADR and mark the old one *Superseded*.

ADR template: **Context → Decision → Rationale → Trade-offs → Status**.

---

### ADR-001: Modular monolith, no microservices
- **Decision:** one Express backend split into domain modules.
- **Rationale:** one developer, demo scale. A monolith is easier to debug, supports simple transactions, and deploys easily.
- **Trade-offs:** no independent scaling per module. Acceptable.
- **Status:** Accepted

### ADR-002: pnpm monorepo with `Trello-Clone-FE`, `Trello-Clone-BE`, `packages/shared`
- **Decision:** replace `apps/web`, `apps/api` with explicitly named folders. Package names `@trello-clone/web|api|shared`. The repository root is the project root.
- **Rationale:** the FE/BE boundary is obvious (easy for Claude Code to scope changes); Zod schemas are shared; types are not defined twice.
- **Trade-offs:** extra workspace configuration; folder names differ from package names.
- **Status:** Accepted

### ADR-003: No `docker/` folder
- **Decision:** `docker-compose.yml` at the root, a `Dockerfile` inside each package.
- **Rationale:** there is only one compose file; an extra folder adds nothing.
- **Revisit when:** there are ≥ 3 infrastructure config files (nginx, init SQL, …).
- **Status:** Accepted

### ADR-004: Repositories only where needed
- **Decision:** services use Prisma directly for simple CRUD. Repositories only for complex queries, queries reused across services, or DB-bound algorithms.
- **Rationale:** avoid thin wrappers with no value; Prisma is already a typed data-access layer.
- **Trade-offs:** modules are not 100% uniform; the clear rule in backend.md compensates.
- **Status:** Accepted

### ADR-005: TanStack Query for server state, Zustand for UI state only
- **Rationale:** built-in caching, refetching, optimistic updates, and invalidation; avoids two sources of truth for the same data.
- **Status:** Accepted

### ADR-006: Schema additions (`RefreshToken`, `WorkspaceInvite`, `Card.boardId`, enums, indexes)
- **Rationale:** the previous plan referenced these features (token rotation, invites) without models. `Card.boardId` enables single-query authorization and realtime routing.
- **Trade-offs:** `boardId` is denormalized and must be kept in sync inside the move transaction.
- **Status:** Accepted

### ADR-007: Shared-schema multi-tenancy with service-level authorization
- **Decision:** filter by membership in every query; return 404 to non-members.
- **Rationale:** simple and safe enough with a role-matrix test suite. Postgres RLS is deferred as defense in depth.
- **Status:** Accepted

### ADR-008: Float positions with rebalancing
- **Rationale:** one row written per drag; simpler than LexoRank.
- **Trade-offs:** occasional full-list rebalance.
- **Status:** Accepted

### ADR-009: Socket.IO realtime, rooms per board, no Redis initially
- **Decision:** all mutations go through REST; sockets only broadcast. Events carry `eventId` + `version`. All emits are centralized in `realtime/events/*`.
- **Rationale:** a single write path, easy authorization; adding a Redis adapter later requires no service changes.
- **Status:** Accepted

### ADR-010: In-memory access token + rotating refresh token in an httpOnly cookie
- **Rationale:** reduces token theft via XSS, allows revocation, and detects stolen tokens through reuse.
- **Trade-offs:** the FE must de-duplicate concurrent refreshes; cookies need same-site setup or careful configuration on deploy.
- **Status:** Accepted

### ADR-011: Claude Code structure: `.claude/CLAUDE.md` + 6 skills + 4 commands
- **Decision:** CLAUDE.md holds concise project-wide rules. Skills for frontend, backend, database, realtime, testing, code-review. **No** `architecture` skill: architecture rules already live in CLAUDE.md and `docs/architecture`, and planning lives in `/plan`.
- **Rationale:** no duplicated content; each skill has a clear purpose and trigger.
- **Status:** Accepted

### ADR-012: Separate `plan.md` / `docs/` / `.claude/`
- **Decision:** `plan.md` is the high-level blueprint, `docs/` holds technical detail, `.claude/` holds AI instructions. Once code exists, code is the source of truth.
- **Rationale:** a single source of truth per kind of information; no contradicting documents.
- **Status:** Accepted

### ADR-013: Task-spec-driven implementation and a single Definition of Done
- **Decision:** implementation proceeds only through task specs in `docs/tasks/` in the order of `docs/tasks/README.md`. Every task is accepted against one canonical DoD (`docs/development/definition-of-done.md`). Unconfirmed values are tracked in `DECISIONS-REQUIRED.md` and used as proposed defaults unless blocking.
- **Rationale:** a new Claude Code session can implement without guessing; no competing DoD definitions.
- **Consequences:** MVP tasks do not emit realtime events and do not enforce plan limits; the activity model arrives in BOARD-001 and its feed in CARD-005.
- **Status:** Accepted (pending owner approval of the PR that introduced it)

### ADR-014: Deterministic guardrails, a reviewer subagent, and Claude GitHub workflows
- **Context:** ADR-011 put every rule in prose (CLAUDE.md, skills). Rules such as "never touch `.env`", "never edit a merged migration", and "never push to `main`" then depend on the model remembering them, and `/implement` reviewed its own diff in the same context that wrote it.
- **Decision:** extend ADR-011 with:
  - **Hooks** in `.claude/settings.json`: `.claude/hooks/guard.mjs` (PreToolUse) blocks reading or editing real `.env*` files, editing migrations already on `origin/main`, and pushing to `main`, and asks the user before `prisma migrate reset` / `db push`; `.claude/hooks/format.mjs` (PostToolUse) runs the repo's Prettier on edited code files.
  - **Subagent** `.claude/agents/code-reviewer.md`: read-only, applies the `code-review` skill in a fresh context; used by `/review` and step 8 of `/implement`.
  - **GitHub workflows:** `.github/workflows/claude.yml` (`@claude` mentions) and `claude-review.yml` (automatic review of ready-for-review PRs against the same skill).
- **Rationale:** guardrails that must always hold are enforced by the harness, not by instructions; a reviewer that did not write the code catches more.
- **Trade-offs:** hooks need Node on the developer machine (already a prerequisite); the workflows need the Claude GitHub App and a `CLAUDE_CODE_OAUTH_TOKEN` secret, and each run counts against the owner's Claude plan usage. The permission deny rules stay as a second layer.
- **Status:** Accepted

### ADR-015: Stack major versions and module system
- **Context:** the stack was listed without versions, and the ones given were outdated (Node 20 reached end of life on 2026-04-30; pnpm 9). Several libraries changed their APIs in ways that older tutorials, and Claude's defaults, get wrong: Express 5 async errors, Prisma 7 config and driver adapters, Tailwind CSS 4 CSS-based config, React Router 7, Zod 4, shadcn/ui replacing `Toast` with Sonner. The build setup was also unresolved: every package extended `moduleResolution: bundler`, while the BE was expected to run compiled output under Node and `shared` had to be built before its consumers.
- **Decision:**
  - Major versions are fixed in [plan.md §3](../../plan.md#3-tech-stack), the single source. Changing a major version needs a new ADR.
  - Node.js 24 LTS (`.nvmrc`, CI); Node 22.12+ stays supported so cloud sessions work. pnpm 10, pinned exactly in `packageManager`; dependency install scripts are allowed only for packages listed in `onlyBuiltDependencies` (`esbuild`, `prisma`, `@prisma/engines` at start).
  - ESM everywhere (`"type": "module"`), one `tsconfig.base.json` with `moduleResolution: bundler`; `typecheck` is `tsc --noEmit` in every package.
  - `@trello-clone/shared` is an internal package whose `exports` point at `src/index.ts`; it has no build step.
  - The BE runs with `tsx watch` in development and is bundled with `tsdown` (inlining `shared`) for production, so bundler resolution is valid for it too. Vitest runs the TypeScript source directly.
- **Rationale:** version-pinned docs keep generated code on current APIs. One module system, and no build ordering between packages, removes the most common monorepo failures ("Cannot find module", missing `.js` extensions, stale `dist/`).
- **Trade-offs:** `tsdown` is a newer tool than `tsc`/`tsup`; if it causes problems, replacing it is confined to the BE `build` script. Consuming `shared` as source means it must stay plain TypeScript with no build-time features.
- **Status:** Accepted
