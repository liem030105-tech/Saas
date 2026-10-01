# Testing Strategy

> **Domain:** test types, tools, when each type is required, required E2E scenarios.
> The baseline acceptance for every task is the [Definition of Done](definition-of-done.md); this file defines its "tests" item.

## Tools and locations
| Type | Tool | Location |
|------|------|----------|
| Unit (BE/shared) | Vitest | next to the code: `*.test.ts` |
| Service (BE) | Vitest + test Postgres | `Trello-Clone-BE/src/modules/<m>/<m>.test.ts` |
| API integration (BE) | Vitest + Supertest + test Postgres | `Trello-Clone-BE/tests/integration/<module>.test.ts` |
| Component / hook (FE) | Vitest + Testing Library + MSW | next to the file: `*.test.tsx` |
| E2E | Playwright | `Trello-Clone-FE/tests/e2e/*.spec.ts` |

## When each test type is required

| Change | Unit | Integration (API) | FE component/hook | E2E |
|--------|:----:|:-----------------:|:-----------------:|:---:|
| Pure function / algorithm (position, token, limits) | **required** | – | – | – |
| New or changed endpoint | if it contains non-trivial logic | **required**: 5-case baseline + endpoint-specific cases from `docs/api` | – | – |
| Authorization or tenant rule | – | **required** (matrix rows touched) | – | – |
| DB invariant / cascade / transaction | – | **required** | – | – |
| FE hook or component **with logic** (optimistic update, rollback, form rules, dedupe) | – | – | **required** | – |
| Presentational-only component | – | – | optional | – |
| **New user-visible flow** in the list below | – | – | – | **required** |
| Refactor with no behavior change | existing tests must pass, no new tests needed | | | |
| Docs / config only | – | – | – | – |

**5-case baseline per endpoint:**
1. happy path
2. validation error → 400
3. unauthenticated → 401
4. **non-member → 404**
5. insufficient role → 403 (skip only for endpoints any authenticated user may call, e.g. `POST /workspaces`)

## E2E scenarios (added by the task that delivers the flow)
| # | Scenario | Added in |
|---|----------|----------|
| 1 | Register → login → reload keeps the session → logout | AUTH-006 |
| 2 | Create workspace → invite link → second user accepts | WORKSPACE-004 |
| 3 | Create board → list → card | CARD-001 |
| 4 | Drag a card between lists → reload → order persisted | CARD-004 |
| 5 | Card modal: comment, checklist, label, member | CARD-005 |
| 6 | VIEWER sees no create actions; non-member opening a board URL sees "not found" | BOARD-002 |
| 7 | Realtime: two browser contexts, A moves a card, B sees it | REALTIME-001 |

Do **not** add E2E tests for internal changes, pure refactors, or API-only behavior already covered by integration tests.

### Running E2E
`pnpm --filter @trello-clone/web test:e2e` (config: `Trello-Clone-FE/playwright.config.ts`, AUTH-006). It needs the test Postgres (`pnpm db:up`; `DATABASE_URL_TEST` or the compose default, name ending in `_test`), then starts its own API on port 4100 (after `prisma migrate deploy`) and web app on port 5174, waiting for `/api/v1/health`, so it can run next to `pnpm dev`, but not at the same time as `pnpm test`: both use the test database, and the BE tests truncate it. Specs create their own users (`tests/e2e/data/`). The whole suite runs against one API from one IP, so its registrations and logins share the auth rate limit (10 per IP per minute, `RATE_LIMITS.auth`): it is at that limit now, so a new flow should reuse an existing spec's user or account for it rather than register more. Locally, install the browser once with `pnpm --filter @trello-clone/web exec playwright install chromium`. E2E is not in CI yet (TESTING-001).

## Rules
- BE service and integration tests run against a real Postgres (`postgres-test` in compose, `DATABASE_URL_TEST`); do not mock Prisma. Vitest's `globalSetup` (`tests/global-setup.ts`) applies the migrations once and refuses any database whose name does not end in `_test`. Reset data per test file with `resetDb()` from `tests/helpers/db.ts` (`TRUNCATE … CASCADE` on every table) and use its `testPrisma` client; files run serially (`fileParallelism: false`).
- FE tests mock the network with MSW; test behavior, not implementation details.
- **Test data lives in its own folder, never hard-coded in a test:** FE in `Trello-Clone-FE/src/testing/data/` (one file per area: `env.ts`, `routes.ts`, `api.ts`, …; builders such as `buildErrorBody()` take overrides). Tests import values from there and assert against the same values, so changing a fixture never means editing assertions. Vitest's public `VITE_*` values come from `testing/data/env.ts` too. Shared keeps its fixtures as JSON in `packages/shared/tests/data/` (e.g. error bodies captured from the running API). The BE follows the same rule in `Trello-Clone-BE/tests/data/` (`env.ts` feeds Vitest's test environment; `http.ts` holds paths and payloads), with shared test helpers in `tests/helpers/`.
- Tests are deterministic: no real timers or network, no order dependence.
- A failing test is a bug until proven otherwise. Never weaken assertions, skip, or delete tests to get green. No `.only` / `.skip` in commits.
- Every new endpoint registers itself in the role-matrix harness (WORKSPACE-005: `describeRoleMatrix` from `Trello-Clone-BE/tests/helpers/role-matrix.ts`, which runs the request as OWNER, ADMIN, MEMBER, VIEWER and a non-member, each against a fresh workspace, and asserts the status each gets) and the tenant-isolation suite (WORKSPACE-006: `Trello-Clone-BE/tests/integration/tenant-isolation.test.ts`, built on the two-tenant fixture `tests/helpers/two-tenants.ts`). There, the non-member case is one `IsolationCase` per route: tenant A calls the endpoint against tenant B's data (and, where the endpoint takes ids, with B's ids through A's own workspace path); the response must reveal nothing of B (404 by default) and `snapshotWorkspace(B)` must be unchanged afterwards. A coverage test walks every route registered in the app (mounted routers included), so a new `/workspaces/*` or `/invites/*` route fails the suite until it adds its case. Board, list, and card tasks extend the fixture with their sample data, `snapshotWorkspace` with their tables, and the coverage filter with their own path prefixes (e.g. `/boards`). The permission maps (BE authoritative, FE visibility copy) are each unit-tested against the matrix fixture `packages/shared/tests/data/permission-matrix.json`.
- Coverage is reported (TESTING-001) but has no hard threshold.

## Claude Code cloud sessions
- There is no Docker daemon. `.claude/hooks/session-start.sh` starts the preinstalled PostgreSQL 16 with the same ports, user, and databases as `docker-compose.yml` (5432 `trello`, 5433 `trello_test`), so the commands above work unchanged.
- Chromium for Playwright is preinstalled; never run `playwright install` there: run E2E with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Details: the `testing` skill (`references/playwright-cloud.md`) and the `run-app` skill.

## CI
`.github/workflows/ci.yml` runs on every PR and on pushes to `main`. There is one run per PR: a new push cancels the previous run, while runs on `main` are never cancelled. The repository owner adds its two checks as required status checks in the ruleset (manual step, FOUNDATION-006):
- **`ci`**: `pnpm install --frozen-lockfile → db:generate → format:check → typecheck → lint → test → build`. Integration tests use a `postgres:16-alpine` service; the job waits for its `pg_isready` health check. The workflow sets `DATABASE_URL_TEST` and dummy, non-secret values for the other variables.
- **`docs`**: `lychee` in offline mode checks every relative link and `#anchor` in the Markdown files; external URLs are not fetched. CI pins lychee 0.24.2. To run the same check locally: `lychee --offline --include-fragments --exclude-path node_modules './**/*.md'`.

E2E on PRs to `main` from TESTING-001 on.
