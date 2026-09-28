# Testing Strategy

> **Domain:** test types, tools, and the minimum bar before a feature is considered done.

## Tools
| Type | Tool | Location |
|------|------|----------|
| Unit / service (BE) | Vitest | `Trello-Clone-BE/src/modules/**/<module>.test.ts` |
| API integration (BE) | Vitest + Supertest + test Postgres (Docker) | `Trello-Clone-BE/tests/integration/*.test.ts` |
| Component / hook (FE) | Vitest + Testing Library + MSW | next to the file under test (`*.test.tsx`) |
| E2E | Playwright | `Trello-Clone-FE/tests/e2e/*.spec.ts` |
| Shared | Vitest | `packages/shared/src/**/*.test.ts` |

## Backend
- **Unit:** pure functions such as `positionBetween`, plan-limit checks, token rotation logic.
- **Service:** run against a real test DB (do not mock Prisma); reset data per test file with `TRUNCATE … CASCADE`.
- **Repository:** only repositories with complex queries (move/rebalance, `findDetail`, search).
- **API integration:** every endpoint covers:
  1. happy path
  2. validation error
  3. unauthenticated → 401
  4. **non-member → 404**
  5. insufficient role → 403

## Frontend
- **Components:** render, interaction, loading/empty/error states.
- **Hooks:** hooks with logic, e.g. optimistic update + rollback (MSW returns an error), realtime de-duplication.
- **Features:** flows within one feature, API mocked via MSW.
- Do not test implementation details (CSS classes, internal state).

## E2E (Playwright)
Required scenarios before a release:
1. Register → login → reload keeps the session
2. Create workspace → board → list → card
3. Drag a card between two lists → reload → order is correct
4. Open a card → add a comment, checklist, and label
5. **Realtime:** two browser contexts; A moves a card and B sees it immediately
6. **Authorization:** a VIEWER sees no create buttons and gets 403 when calling the API directly; a non-member opening a board URL sees 404

## Minimum bar for "done"
- [ ] New endpoints have integration tests for all 5 cases above.
- [ ] New service business logic has unit or service tests.
- [ ] Hooks/components with logic (not just presentation) have tests.
- [ ] Important new user flows are added to E2E or extend an existing scenario.
- [ ] `pnpm test` passes locally and in CI; no `skip` or `only` left behind.

## CI (GitHub Actions)
`install → typecheck → lint → test (unit + integration with a postgres service) → build`. E2E runs on PRs to `main` (Phase 8).
Coverage is reported but has no hard threshold; covering the important cases matters more.
