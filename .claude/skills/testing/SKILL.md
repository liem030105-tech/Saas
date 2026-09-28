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
The always-on rules live in [`.claude/rules/testing.md`](../../rules/testing.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

## References
Read the one that matches the work before writing code; they show the target shape. If the real code differs, the code wins: update the reference in the same PR.
- [`references/api-test-template.md`](references/api-test-template.md): the 5-case integration test for one endpoint
- [`references/msw.md`](references/msw.md): FE component/hook tests with MSW and `renderWithProviders`
- [`references/playwright-cloud.md`](references/playwright-cloud.md): E2E conventions and running Playwright in cloud sessions

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
