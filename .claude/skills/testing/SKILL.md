---
name: testing
description: Use when writing, updating, or debugging tests – Vitest unit/service tests, Supertest API integration tests, FE component/hook tests with Testing Library and MSW, or Playwright E2E – and when deciding what tests a feature needs before it is done.
---

# Skill: Testing

## Purpose
Make every feature meet the minimum test bar with reliable, meaningful tests, and diagnose failures by root cause.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/development/testing.md` – tools, locations, minimum bar, required E2E scenarios
2. The code under test and its `docs/api/<module>.md` (lists required cases per endpoint)

## Rules
- Every endpoint: happy path, validation (400), unauthenticated (401), non-member (404), insufficient role (403).
- BE service/integration tests use the real test Postgres (no Prisma mocks); reset data per file.
- FE tests mock the network with MSW, not by mocking modules; test behavior, not implementation details.
- Use factories/helpers from `Trello-Clone-BE/tests/` instead of ad-hoc fixtures.
- Tests are deterministic: no real timers or network, no ordering dependence between files.
- A failing test is a bug until proven otherwise. Find the root cause; never "fix" by weakening assertions.
- Never leave `.skip`, `.only`, or commented-out tests. Never delete a test to get green.

## May modify
- `**/*.test.ts(x)`, `**/*.spec.ts`, `Trello-Clone-BE/tests/**`, `Trello-Clone-FE/tests/**`
- Test configuration (vitest/playwright configs) when required
- Production code **only** to fix a real bug the test exposed (state it in the summary)

## Must never modify
- Assertions to match buggy behavior
- CI configuration to skip or ignore failing suites

## Done checklist
- [ ] Minimum bar from `docs/development/testing.md` met
- [ ] `pnpm test` passes locally, run twice to catch flakiness
- [ ] New E2E scenarios added for new important user flows
