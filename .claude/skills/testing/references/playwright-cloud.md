# Playwright E2E, locally and in cloud sessions

- Specs: `Trello-Clone-FE/tests/e2e/*.spec.ts`; the scenario list is in [testing.md → E2E scenarios](../../../../docs/development/testing.md#e2e-scenarios-added-by-the-task-that-delivers-the-flow).
- `Trello-Clone-FE/playwright.config.ts` starts its own API (test database, port 4100) and web app (port 5174) with `webServer` and waits for `/api/v1/health`; configuration values live in `tests/e2e/data/env.ts`, generated users in `tests/e2e/data/users.ts`.
- Select by role and label (`getByRole('button', { name: 'Add card' })`), not by CSS class. Each spec creates its own generated user (`tests/e2e/data/users.ts`) and data, so specs stay independent; set up state through the API unless the flow under test is the UI itself.

## Cloud sessions
- Chromium is preinstalled under `/opt/pw-browsers`, and `PLAYWRIGHT_BROWSERS_PATH` points there. **Never run `playwright install`**: nothing needs downloading, and the download may be blocked.
- The config reads `use.launchOptions.executablePath` from `PW_CHROMIUM_PATH`: run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm --filter @trello-clone/web test:e2e` in the cloud (the installed build may not match `@playwright/test`). Never hard-code the path in the config.
- PostgreSQL is started by `.claude/hooks/session-start.sh`; there is no Docker.
