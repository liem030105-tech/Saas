# Development Setup

> **Domain:** first-time setup and running the project. Common errors: [troubleshooting.md](troubleshooting.md). Docker details: [deployment/local.md](../deployment/local.md).
> ⚠️ Code is created in **Phase 0**. The commands below are **planned** and will be updated when Phase 0 lands.

## Prerequisites
- Node.js 24 LTS (`.nvmrc`); 22.13+ also works (ESLint 10's minimum)
- pnpm 10 (`corepack enable`; the exact version is pinned in `packageManager`)
- Docker + Docker Compose (PostgreSQL)
- Git

## Steps
```bash
git clone https://github.com/liem030105-tech/Saas.git
cd Saas
pnpm install
pnpm --filter @trello-clone/api db:generate  # Prisma client (git-ignored); typecheck/test/build need it

cp Trello-Clone-BE/.env.example Trello-Clone-BE/.env
cp Trello-Clone-FE/.env.example Trello-Clone-FE/.env
# fill in values (never commit .env)

pnpm db:up                                   # docker compose up -d postgres postgres-test
pnpm --filter @trello-clone/api db:migrate   # run migrations
pnpm --filter @trello-clone/api db:seed      # demo@example.com, password from SEED_DEMO_PASSWORD; safe to re-run
pnpm dev                                     # FE :5173, BE :4000
```

## Environment variables

`Trello-Clone-BE/.env.example`
| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_URL_TEST` | Test database (`postgres-test`, name must end in `_test`) |
| `SEED_DEMO_PASSWORD` | Password for the seeded demo user (FOUNDATION-004) |
| `JWT_ACCESS_SECRET` | Access-token signing secret (≥ 32 chars) |
| `ACCESS_TOKEN_TTL` | Proposed default `15m` (D-01) |
| `REFRESH_TOKEN_TTL_DAYS` | Proposed default `30` (D-02) |
| `CLIENT_URL` | FE origin, used for CORS; must be `https://` when `NODE_ENV=production` |
| `TRUST_PROXY` | How many proxies sit in front of the API, so rate limits see the client's IP: `0` locally (default), `1` on Render ([deployment](../deployment/staging.md)) |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` | Billing (BILLING-001), Stripe **test mode**: the `sk_test_…` key and the `price_…` id of a recurring per-member monthly Pro price (D-13). Without them checkout and the portal answer `500` (logged); everything else works. Use test-mode keys; the variables also take live keys for a real deployment (DEPLOYMENT-001) |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` signing secret of the webhook endpoint (locally, the one `stripe listen` prints, see below). Without it every webhook gets `400` |
| `S3_BUCKET`, `S3_REGION` | Attachments (ATTACHMENTS-001, ADR-020). Without them uploads answer `500` and are logged; everything else works |
| `S3_ENDPOINT` | Optional: an S3-compatible endpoint (e.g. MinIO `http://localhost:9000` for local development); path-style addressing is used then |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials (the AWS SDK's standard variables). Never commit them |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Error tracking ([ADR-024](../decisions/README.md#adr-024-error-tracking-with-sentry-fe-and-be-d-23)). Empty locally: nothing is sent. On Render: the API project's DSN and `staging` or `production`. `RENDER_GIT_COMMIT` (set by Render) becomes the release |

`Trello-Clone-FE/.env.example`
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | e.g. `http://localhost:4000/api/v1` |
| `VITE_SOCKET_URL` | e.g. `http://localhost:4000` |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` | Error tracking ([ADR-024](../decisions/README.md#adr-024-error-tracking-with-sentry-fe-and-be-d-23)). Empty locally. A DSN only allows sending events, so it may be public. `VITE_VERCEL_GIT_COMMIT_SHA` (set by Vercel) becomes the release |

`VITE_*` variables are exposed to the browser – **never** put secrets there.

## Stripe webhooks locally (BILLING-001)
Stripe cannot reach `localhost`, so forward its events with the [Stripe CLI](https://docs.stripe.com/stripe-cli):
```bash
stripe login
stripe listen --forward-to localhost:4000/api/v1/billing/webhook
```
Put the `whsec_…` secret it prints in `STRIPE_WEBHOOK_SECRET` and restart the API. A test-mode checkout (card `4242 4242 4242 4242`) then makes the workspace Pro; cancelling in the Customer Portal makes it Free again.

## Common commands (from the root)
| Command | Effect |
|---------|--------|
| `pnpm dev` | Run FE + BE |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Check the whole repo |
| `pnpm test:coverage` | The tests with a coverage report per package (`<package>/coverage/index.html`) |
| `pnpm format` / `pnpm format:check` | Format / check formatting with Prettier |
| `pnpm --filter @trello-clone/web test:e2e` | Run Playwright E2E (needs the test DB and, once, `pnpm --filter @trello-clone/web exec playwright install chromium`; see [testing.md → Running E2E](testing.md#running-e2e)) |
| `pnpm --filter @trello-clone/api db:studio` | Open Prisma Studio |

## Claude Code
- Hooks in `.claude/settings.json` run with `node`, so Node must be on `PATH` before starting Claude Code (ADR-014).
- The GitHub workflows `claude.yml` (`@claude` mentions) and `claude-review.yml` (automatic PR review) need the [Claude GitHub App](https://github.com/apps/claude) installed on the repository and a repository secret `CLAUDE_CODE_OAUTH_TOKEN` (Settings → Secrets and variables → Actions). Create the token on your machine with `claude setup-token` while logged in to a Claude Pro/Max plan; runs count against that plan's usage, no API key needed. Never paste the token anywhere but the secret. Without it the workflows fail; nothing else is affected.
- In Claude Code cloud sessions, `.claude/hooks/session-start.sh` installs dependencies, starts PostgreSQL without Docker, and exports the local `DATABASE_URL` / `DATABASE_URL_TEST` (ADR-016). Secrets such as `JWT_ACCESS_SECRET` and `SEED_DEMO_PASSWORD` are never created by Claude: set them as environment variables in the cloud environment's settings, or in your local environment files created from `.env.example`.
- `.mcp.json` adds the Playwright and Context7 MCP servers; Claude Code asks you to approve them the first time.
