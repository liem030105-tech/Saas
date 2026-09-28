# Playwright E2E, locally and in cloud sessions

- Specs: `Trello-Clone-FE/tests/e2e/*.spec.ts`; the scenario list is in [testing.md → E2E scenarios](../../../../docs/development/testing.md#e2e-scenarios-added-by-the-task-that-delivers-the-flow).
- Start the stack first (the `run-app` skill), or let `playwright.config.ts` start it with `webServer`.
- Select by role and label (`getByRole('button', { name: 'Add card' })`), not by CSS class. Each spec creates its own user and workspace through the API, so specs stay independent.

## Cloud sessions
- Chromium is preinstalled under `/opt/pw-browsers`, and `PLAYWRIGHT_BROWSERS_PATH` points there. **Never run `playwright install`**: nothing needs downloading, and the download may be blocked.
- If the project's `@playwright/test` version expects a different Chromium build, read `use.launchOptions.executablePath` from an environment variable (e.g. `PW_CHROMIUM_PATH`) and set it to `/opt/pw-browsers/chromium` only in the cloud. Do not hard-code the path in the config.
- PostgreSQL is started by `.claude/hooks/session-start.sh`; there is no Docker.
