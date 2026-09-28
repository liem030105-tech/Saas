# TESTING-001: Testing hardening and E2E in CI

| Field | Value |
|-------|-------|
| Phase | 8 (Post-MVP) |
| Depends on | REALTIME-001, ATTACHMENTS-001, SEARCH-001, NOTIFICATIONS-001, BILLING-001 |
| Blocked by decisions | none |
| Skills | testing |

# Goal
The test suite is complete against the matrix, E2E runs in CI, and coverage is reported.

# Context
[testing.md](../development/testing.md) matrix and E2E scenario list.

# Requirements
1. An audit of every endpoint in `docs/api` against the 5-case baseline and the role-matrix/tenant suites; fill the gaps.
2. All 7 E2E scenarios run in CI on PRs to `main` (a separate `e2e` job, Playwright browsers cached).
3. Coverage report (Vitest v8) uploaded as a CI artifact; no threshold.
4. Fix any flaky tests at the root cause (never retry-to-green).

# Out of Scope
New features.

# Frontend Changes
Tests only.

# Backend Changes
Tests only.

# Database Changes
None.

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
CI uses only test secrets.

# Testing
This task is the test.

# Acceptance Criteria
- [ ] A gap report shows zero missing baseline cases; `e2e` is green and added as a required check.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
All Phase 5–7 tasks.

# Risks
E2E runtime → shard or run on `main` PRs only.
