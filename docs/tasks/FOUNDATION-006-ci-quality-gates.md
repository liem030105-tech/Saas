# FOUNDATION-006: CI quality gates

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Status | Todo |
| Depends on | FOUNDATION-004, FOUNDATION-005 |
| Blocked by decisions | none |
| Skills | testing |

# Goal
A GitHub Actions workflow that blocks merging unless install, typecheck, lint, test, and build pass.

# Context
CI spec in [testing.md → CI](../development/testing.md#ci). The repository ruleset should require this check (see the note in Acceptance Criteria).

# Requirements
1. `.github/workflows/ci.yml` triggered on `pull_request` and on `push` to `main`; a single job with id and name **`ci`**.
2. Steps: checkout → setup Node 20 + pnpm cache → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`.
3. Service container `postgres:16-alpine` for integration tests; `DATABASE_URL_TEST` and dummy non-secret env values set in the workflow.
4. Concurrency group per branch, cancelling in-progress runs.

# Out of Scope
E2E in CI (TESTING-001), deployment (DEPLOYMENT-001).

# Frontend Changes
None.

# Backend Changes
None.

# Database Changes
None.

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
No real secrets in the workflow; test-only JWT secrets are fine. Use `permissions: contents: read`.

# Testing
The workflow itself: open the PR and see `ci` green.

# Acceptance Criteria
- [ ] The `ci` check runs and passes on this task's PR.
- [ ] A PR with a type error fails `ci`.
- [ ] After merge, the repository owner adds `ci` as a required status check in the ruleset (manual step, noted in the PR).

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md)

# Dependencies
FOUNDATION-004 (DB tests) and FOUNDATION-005 (all packages exist).

# Risks
Flaky DB startup → use a service health check (`pg_isready`) before the tests.
