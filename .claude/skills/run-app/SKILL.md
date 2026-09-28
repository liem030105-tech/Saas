---
name: run-app
description: Use when a change should be checked in the running application – starting PostgreSQL, the API, and the web app (locally or in a Claude Code cloud session), logging in as the demo user, and looking at a page in a real browser with Playwright. Also use when asked to run, start, or screenshot the app.
---

# Skill: Run the app and check it in a browser

## Purpose
Tests prove behavior; this skill proves the user can see it. Use it before reporting any user-visible change as done (CLAUDE.md §9 rule 7).
Available once FOUNDATION-004 (API + DB) and FOUNDATION-003 (web) are done; before that, say the app cannot run yet.

## 1. Database
| Where | How |
|-------|-----|
| Local machine | `pnpm db:up` (Docker Compose: `postgres` on 5432, `postgres-test` on 5433) |
| Claude Code cloud session | Already running: `.claude/hooks/session-start.sh` starts the preinstalled PostgreSQL 16 with the same ports, user `trello`/`trello`, and databases `trello` / `trello_test`. Check with `pg_isready -h localhost -p 5432`; if it is down, run `CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh`. There is no Docker daemon in the cloud: never try `docker compose` there. |

Environment files are the user's: never read or write them (the guard hook blocks it). In cloud sessions the hook already exports `DATABASE_URL` and `DATABASE_URL_TEST`; other variables (e.g. `JWT_ACCESS_SECRET`, `SEED_DEMO_PASSWORD`) come from the environment's settings. Locally, if `Trello-Clone-BE/.env` is missing, ask the user to create it from `.env.example`. If the API refuses to start because a variable is missing, report which one and ask; never invent a secret.

## 2. Schema and seed
```bash
pnpm --filter @trello-clone/api db:generate
pnpm --filter @trello-clone/api db:migrate      # applies migrations to the dev DB
pnpm --filter @trello-clone/api db:seed         # idempotent; demo user demo@example.com
```

## 3. Start the servers
Run `pnpm dev` **in the background** (Bash `run_in_background`), then wait until both answer:
- API: `curl -sf http://localhost:4000/api/v1/health` → `{ "data": { "status": "ok", "db": "ok" } }`
- Web: `curl -sf http://localhost:5173` → HTML

## 4. Look at the page
Use the Playwright MCP server from `.mcp.json` if it is available; otherwise a short script with `@playwright/test`'s `chromium`:
- In cloud sessions Chromium is preinstalled under `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`). Never run `playwright install`; if the installed Playwright version expects a different browser build, launch with `executablePath: "/opt/pw-browsers/chromium"` (a symlink to the installed build).
- Log in through the UI as `demo@example.com` (password from `SEED_DEMO_PASSWORD`, ask the user if unknown), open the changed page, and take a screenshot into your scratchpad directory (never commit screenshots).
- Check the golden path **and** the loading, empty, and error states the change touched. Read the browser console for errors.

## 5. Report and clean up
- Say what you opened, what you saw, and attach or describe the screenshot. A console error or a broken state is a finding: fix it or report it.
- Stop the background `pnpm dev` when done.

## Done checklist
- [ ] The changed flow works in the browser, not only in tests
- [ ] No new console errors or failed network requests
- [ ] Background servers stopped
