# FOUNDATION-001: Repository setup

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Depends on | – |
| Blocked by decisions | none |
| Skills | – |

# Goal
Turn the repository into a working pnpm workspace with shared tooling, so the FE, BE, and shared packages can be added in later tasks.

# Context
Implements the root layout in [plan.md §4](../../plan.md#4-root-folder-structure) and the monorepo rules in [architecture/overview.md](../architecture/overview.md#monorepo-pnpm-workspace). No application code.

# Requirements
1. Root `package.json` (`"private": true`, `"type": "module"`, `packageManager` pinned to an exact pnpm 10 version, `engines.node` `>=22.12`) with scripts `dev`, `build`, `lint`, `typecheck`, `test`, `format`, `format:check`, `db:up`. Each fans out with `pnpm -r` (they may no-op until packages exist).
2. `pnpm-workspace.yaml` listing `Trello-Clone-FE`, `Trello-Clone-BE`, `packages/*`, plus `onlyBuiltDependencies: [esbuild, prisma, '@prisma/engines']` (ADR-015; pnpm 10 skips other install scripts).
3. `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `module: ESNext`, `moduleResolution: bundler`, `verbatimModuleSyntax`, `noEmit`, extended by every package (ADR-015).
4. ESLint flat config at the root (`@typescript-eslint`, `import/order`, `no-restricted-imports` blocking FE↔BE imports, and `import/no-restricted-paths` zones for the FE import direction in [frontend.md](../architecture/frontend.md#what-belongs-where) and for BE modules importing another module's non-service files) and a Prettier config per [coding-conventions.md](../development/coding-conventions.md).
5. `.gitignore` (node_modules, dist, build, coverage, `.env`, `.env.*` except `.env.example`, `**/src/generated/`, `.claude/settings.local.json`, `CLAUDE.local.md`), `.nvmrc` (`24`), `.editorconfig`.
6. `docker-compose.yml` with `postgres` and `postgres-test` exactly as in [deployment/local.md](../deployment/local.md).
7. README "Getting started" points to `docs/development/setup.md`.

# Out of Scope
Creating the FE/BE/shared packages (FOUNDATION-002/003/005), CI (FOUNDATION-006), any application dependency.

# Frontend Changes
None.

# Backend Changes
None.

# Database Changes
None (only the compose services).

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
`.gitignore` must exclude every real `.env*` file. The compose passwords are local-only defaults and must not be reused anywhere else.

# Testing
No automated tests. Verify manually: `pnpm install`, `pnpm format:check`, `docker compose up -d postgres postgres-test` → both healthy.

# Acceptance Criteria
- [ ] `pnpm install` succeeds on a clean clone with Node 24, and with Node 22.12+.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` run without error (no packages yet).
- [ ] `docker compose up -d` starts Postgres on 5432 and 5433.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
None.

# Risks
Tool-version drift → pin exact versions in `package.json` files; major versions must match [plan.md §3](../../plan.md#3-tech-stack).
