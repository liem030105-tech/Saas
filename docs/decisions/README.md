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
- **Amendment (REALTIME-001c):** a change is not sent back to the tab that made it. The FE sends its socket id as the `X-Socket-Id` header on REST requests; BE middleware keeps it for the request (AsyncLocalStorage, `realtime/origin.ts`) and `emitEvent` emits to the rooms `.except()` that socket. Filtering by `actorId` on the FE was rejected: it would also hide the change from the same user's other tabs. Trade-off: a request sent while the socket is reconnecting has no id, so its events come back to that tab; dedupe, the stale-version check and the mutation's own refetch absorb them.
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
- **Status:** Accepted

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

### ADR-016: Path-scoped rules, skill references, and a verification loop
- **Context:** area rules lived inside skills, so they applied only when a skill happened to load; skills held rules but no code examples, so every session invented its own patterns; Claude could not run the app or the test database in cloud sessions (no Docker daemon); the project's `/review` command and `code-review` skill collided with Claude Code's built-in `/code-review` (alias `/review`); `claude-review` ran on every push and consumed the owner's plan quota.
- **Decision:** extend ADR-011 and ADR-014 with:
  - `.claude/rules/<area>.md` with `paths:` frontmatter (frontend, backend, database, shared, realtime, testing). They load automatically when Claude reads matching files; skills link to them instead of repeating them. CLAUDE.md §9 keeps only rules not stated elsewhere.
  - `references/` in the `backend`, `database`, and `testing` skills with target code shapes. Once real code exists, the code wins and the reference is updated in the same PR.
  - Renames: command `/review` → `/check-diff`, skill `code-review` → `review-checklist`.
  - Verification loop: the `run-app` skill (start DB, API, web; check the change in a browser), `.claude/hooks/session-start.sh` (cloud only: installs dependencies once the workspace exists and starts the preinstalled PostgreSQL 16 on the compose ports), and `.mcp.json` with the Playwright and Context7 MCP servers.
  - `claude-review` runs on `opened`, `ready_for_review`, and `reopened` only; re-reviews are requested with `@claude review`.
  - `.github/pull_request_template.md` mirroring the Definition of Done.
- **Rationale:** rules that load by path are applied consistently; examples produce consistent code; a change is only done when it has been seen working; built-in commands keep their meaning.
- **Trade-offs:** references can drift from the code (mitigated by the "code wins, update in the same PR" rule); MCP servers are fetched with `npx` and need network access in the session; the session-start hook adds a few seconds to cloud session startup.
- **Status:** Accepted

### ADR-017: Position helpers live in the shared package
- **Context:** the FE predicts positions for optimistic drag and drop, and the BE stores them. The docs put the helpers in the BE and told the FE to copy the formulas (LIST-001), which contradicted both CLAUDE.md ("never duplicate business logic between FE and BE") and the shared-package rules (which forbade "position math").
- **Decision:** the position constants and pure helpers (`initialPosition`, `positionAfter`, `positionBefore`, `positionBetween`, `needsRebalance`) live once in `packages/shared/src/utils/position.ts` and are imported by both sides. Rebalancing reads and writes the database, so it stays in the BE (`lib/rebalance.ts`). The server remains authoritative: it validates and may rebalance any client-supplied position.
- **Rationale:** the FE must predict exactly what the BE stores, or cards visibly jump after every drag; one implementation with one test suite guarantees that.
- **Trade-offs:** shared gains a small `utils/` folder; the rule "no business logic in shared" now has one named exception, limited to pure formulas with no I/O.
- **Status:** Accepted

### ADR-018: Node floor raised to 22.13
- **Context:** ADR-015 kept Node 22.12+ supported, but ESLint 10 (chosen in FOUNDATION-001 because ESLint 9 is end-of-life) requires `^20.19.0 || ^22.13.0 || >=24`.
- **Decision:** the minimum is Node 22.13 (`engines.node >=22.13`); Node 24 LTS stays the target. This supersedes the Node bullet of ADR-015; the rest of ADR-015 stands.
- **Status:** Accepted

### ADR-019: No workspace on registration (D-06); UI text is English
- **Context:** D-06 asked whether registering should create a personal workspace automatically.
- **Decision:** no. Registration creates only the user. A signed-in user without a workspace sees a "Create your first workspace" screen on `/` and names it; with workspaces, `/` redirects to the first one (WORKSPACE-001). All UI text is English; the MVP has no translations.
- **Rationale:** the user names their workspace, and registration stays a single-purpose transaction (AUTH-001 already shipped without it).
- **Trade-offs:** one extra step for new users, and one more empty state to design.
- **Status:** Accepted

### ADR-020: Attachments in AWS S3 (D-20)
- **Context:** ATTACHMENTS-001 needs file storage; D-20 offered AWS S3 or Cloudinary.
- **Decision:** AWS S3, in a **private** bucket. Uploads go through the API (Multer memory storage, then `lib/storage.ts`); nothing is written to server disk. The API stores each file's object key, never a URL: every response that shows a file (an attachment, a card cover) carries a fresh signed GET URL that expires (lifetime D-27), so someone removed from a workspace loses access once their URLs expire. A card cover is therefore stored as the attachment's id (`coverAttachmentId`), not as a URL. The adapter speaks the S3 API only, so an S3-compatible store (MinIO locally) works unchanged.
- **Rationale:** plain object storage with no vendor-specific processing; the S3 API is the common standard, cheap at demo scale, and easy to run locally.
- **Trade-offs:** no built-in image transformations (thumbnails, if wanted, are a later change); AWS credentials to manage per environment; links shared outside the app stop working after the URL lifetime (chosen by the owner over permanent public links).
- **Status:** Accepted

### ADR-021: In-app notifications only (D-09)
- **Context:** Phase 6 lists notifications but nothing specified delivery, triggers or data.
- **Decision:** in-app only: stored notifications per user, a bell with an unread count and a list, and a live update over the existing Socket.IO connection (the user's own room). Triggers: assigned to a card; a comment on a card you are a member of, or one mentioning you; a card you are a member of coming due; a workspace invite for an existing account. No email (D-18 stays open), no push.
- **Rationale:** uses the realtime layer already built; no email provider or new infrastructure (no queues or schedulers without an ADR, so "coming due" must not need a job runner; the spec decides how).
- **Trade-offs:** users only see notifications while they use the app.
- **Status:** Accepted

### ADR-022: Landing and pricing pages in BILLING-001; other unphased ideas to the backlog (D-08)
- **Context:** D-08 listed ideas that earlier plans mentioned but no phase covered: board templates, dark mode, a landing page, a pricing page, board favorites.
- **Decision:** the landing page (`/` for signed-out visitors) and the pricing page (`/pricing`, public) ship with BILLING-001 (Phase 7, sub-PR 001d). Board templates go to the backlog after Phase 9; dark mode and board favorites (client-side only, if ever done) go to the backlog. No task specs exist for the backlog items.
- **Rationale:** the pricing page explains the Free and Pro plans that BILLING-001 enforces, and a landing page gives signed-out visitors somewhere to start instead of the login form. The other ideas are not needed for the product to work.
- **Trade-offs:** two more public pages to keep consistent with `PLAN_LIMITS` and the price (D-13). The pricing page reads the limits from the shared constants, so they cannot drift.
- **Status:** Accepted

### ADR-023: Hosting on Vercel, Render and Neon; one domain for FE and API (D-21, D-22)
- **Context:** DEPLOYMENT-001 needed a host for each part (D-21) and a domain layout that keeps the `SameSite=Strict` refresh cookie working (D-22).
- **Decision:** the FE (static Vite build) on **Vercel**, built from the repository (no Docker). The API (Express + Socket.IO, one long-running instance) on **Render**, from `Trello-Clone-BE/Dockerfile`. PostgreSQL on **Neon** (a branch per environment). FE and API share one registrable domain the owner controls, e.g. `app.<domain>` (Vercel) and `api.<domain>` (Render); staging uses `staging.<domain>` and `api.staging.<domain>`. The browser then treats FE → API as same-site, so the refresh cookie stays `HttpOnly; Secure; SameSite=Strict` and needs no CSRF token. Files stay on AWS S3 (ADR-020).
- **Rationale:** Render runs the API as a normal process with WebSockets, which Socket.IO needs (serverless platforms do not keep connections). Vercel and Neon have free tiers, preview deployments and branching. Keeping one site avoids weakening the cookie (D-22 option b).
- **Trade-offs:** a custom domain is required (the providers' default domains, `*.vercel.app` and `*.onrender.com`, are different sites, and the refresh would fail). Three providers to configure. One API instance (scaling needs the Redis adapter ADR). Render's free instances sleep, so the API needs a paid one. Staging on the same registrable domain is same-site with production: only CORS and host-only cookies keep them apart (a separate staging domain is stronger, if the owner wants one).
- **Status:** Accepted
