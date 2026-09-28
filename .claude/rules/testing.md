---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/tests/**"
  - "**/vitest.config.ts"
  - "**/playwright.config.ts"
---

# Tests rules

Loaded automatically when Claude reads matching files. Procedures, references, and checklists: the `testing` skill.

- Every endpoint: happy path, validation (400), unauthenticated (401), non-member (404), insufficient role (403).
- BE service/integration tests use the real test Postgres (no Prisma mocks); reset data per file.
- FE tests mock the network with MSW, not by mocking modules; test behavior, not implementation details.
- Use factories/helpers from `Trello-Clone-BE/tests/` instead of ad-hoc fixtures.
- Tests are deterministic: no real timers or network, no ordering dependence between files.
- A failing test is a bug until proven otherwise. Find the root cause; never "fix" by weakening assertions.
- Never leave `.skip`, `.only`, or commented-out tests. Never delete a test to get green.
