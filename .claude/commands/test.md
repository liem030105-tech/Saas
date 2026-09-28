---
description: Add missing tests or run and diagnose the test suite for a scope
argument-hint: [package, module, or file – defaults to changed files]
---

Testing task for: $ARGUMENTS (if empty, use the files changed vs. `main`).

Use the `testing` skill.

1. Determine the scope and the package filter (`@trello-clone/web`, `@trello-clone/api`, `@trello-clone/shared`).
2. Compare existing tests with the minimum bar in `docs/development/testing.md` and the "Required tests" section of the relevant `docs/api/<module>.md`. List gaps.
3. Write the missing tests.
4. Run `pnpm --filter <pkg> test` (and `test:e2e` if E2E was touched).
5. For any failure: find the root cause. Fix production code only if it is a real bug (say so); never weaken assertions or skip tests.
6. Report: tests added, results, remaining gaps.
