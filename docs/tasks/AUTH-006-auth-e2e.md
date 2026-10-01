# AUTH-006: Authentication E2E

| Field | Value |
|-------|-------|
| Phase | 1 (MVP) |
| Depends on | AUTH-004, AUTH-005 |
| Blocked by decisions | none |
| Skills | testing |

# Goal
Playwright is set up and E2E scenario 1 (register → login → reload → logout) passes.

# Context
E2E scenarios: [testing.md](../development/testing.md#e2e-scenarios-added-by-the-task-that-delivers-the-flow).

# Requirements
1. Playwright config (`Trello-Clone-FE/playwright.config.ts`, specs in `tests/e2e`) that starts the API (test DB) and the FE.
2. Scenario 1: register → lands on `/` → reload keeps the session → logout → `/login` → login again.
3. Script `pnpm --filter @trello-clone/web test:e2e`.

# Out of Scope
Running E2E in CI (TESTING-001).

# Frontend Changes
`tests/e2e/*`, `playwright.config.ts`, and `data-testid`s only where role/label selectors are insufficient.

# Backend Changes
None.

# Database Changes
None.

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
Use generated test users; no real credentials.

# Testing
This task is the test.

# Acceptance Criteria
- [ ] Scenario 1 passes locally twice in a row.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
AUTH-004, AUTH-005.

# Risks
Flaky startup → wait on `/api/v1/health` before running.
