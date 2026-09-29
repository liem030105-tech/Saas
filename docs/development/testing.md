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

## Rules
- BE service and integration tests run against a real Postgres (`postgres-test` in compose, `DATABASE_URL_TEST`); do not mock Prisma. Vitest's `globalSetup` (`tests/global-setup.ts`) applies the migrations once and refuses any database whose name does not end in `_test`. Reset data per test file with `resetDb()` from `tests/helpers/db.ts` (`TRUNCATE … CASCADE` on every table) and use its `testPrisma` client; files run serially (`fileParallelism: false`).
- FE tests mock the network with MSW; test behavior, not implementation details.
- **Test data lives in its own folder, never hard-coded in a test:** FE in `Trello-Clone-FE/src/testing/data/` (one file per area: `env.ts`, `routes.ts`, `api.ts`, …; builders such as `buildErrorBody()` take overrides). Tests import values from there and assert against the same values, so changing a fixture never means editing assertions. Vitest's public `VITE_*` values come from `testing/data/env.ts` too. Shared keeps its fixtures as JSON in `packages/shared/tests/data/` (e.g. error bodies captured from the running API). The BE follows the same rule in `Trello-Clone-BE/tests/data/` (`env.ts` feeds Vitest's test environment; `http.ts` holds paths and payloads), with shared test helpers in `tests/helpers/`.
- Tests are deterministic: no real timers or network, no order dependence.
- A failing test is a bug until proven otherwise. Never weaken assertions, skip, or delete tests to get green. No `.only` / `.skip` in commits.
- Every new endpoint registers itself in the role-matrix harness (WORKSPACE-005) and the tenant-isolation suite (WORKSPACE-006).
- Coverage is reported (TESTING-001) but has no hard threshold.

## Claude Code cloud sessions
- There is no Docker daemon. `.claude/hooks/session-start.sh` starts the preinstalled PostgreSQL 16 with the same ports, user, and databases as `docker-compose.yml` (5432 `trello`, 5433 `trello_test`), so the commands above work unchanged.
- Chromium for Playwright is preinstalled; never run `playwright install` there. Details: the `testing` skill (`references/playwright-cloud.md`) and the `run-app` skill.

## CI
`install → typecheck → lint → test (unit + integration with a postgres service) → build` on every PR (FOUNDATION-006). E2E on PRs to `main` from TESTING-001 on.
