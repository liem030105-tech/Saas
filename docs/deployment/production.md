# Production

> **Domain:** the production environment (DEPLOYMENT-001). Hosting and domains: [ADR-023](../decisions/README.md#adr-023-hosting-on-vercel-render-and-neon-one-domain-for-fe-and-api-d-21-d-22) (D-21, D-22). Monitoring: **D-23** (proposed default Sentry, not set up yet).

## Infrastructure
| Component | Platform | Address |
|-----------|----------|---------|
| FE | Vercel, project `trello-web` (static + CDN) | `https://app.<domain>` |
| API + Socket.IO | Render, service `trello-api-production` (`render.yaml`), one instance | `https://api.<domain>` |
| DB | Neon, branch `production` (point-in-time restore) | – |
| Files | AWS S3 (ADR-020), a production bucket | – |
| Error tracking | D-23 (proposed default: Sentry, FE + BE) | – |

Set up like [staging](staging.md#one-time-setup-repository-owner), with production values:
- **Render (`trello-api-production`):** `CLIENT_URL=https://app.<domain>`, the Neon production branch's direct `DATABASE_URL` (not the pooler), the production S3 bucket, and Stripe keys (live keys only at go-live). Custom domain `api.<domain>`.
- **Vercel (project `trello-web`):** Production Branch `production`, `VITE_API_URL=https://api.<domain>/api/v1`, `VITE_SOCKET_URL=https://api.<domain>`, and the domain `app.<domain>`.
- **No seed data** in production.

## Releasing
1. `main` is green and has been checked on staging.
2. Tag the commit: `git tag v1.2.0 <sha> && git push origin v1.2.0`. The `release` workflow (`.github/workflows/release.yml`) checks that the tag is on `main` and that `ci`, `e2e`, `docker` and `docs` passed on that commit, then moves the `production` branch to it, fast-forward only.
   - One-time setup: a fine-grained personal access token (or GitHub App token) for this repository with **Contents** and **Workflows** write, saved as the repository secret `RELEASE_TOKEN`. The default `GITHUB_TOKEN` may not push commits that change workflow files.
   - A ruleset that protects `production` must let that token push, or the release stops here.
3. Render deploys `trello-api-production` from `production`. The container applies the migrations, which must be backward compatible ([architecture/database.md](../architecture/database.md#migrations)), then starts. Traffic switches once the health check passes. Vercel deploys `trello-web` from `production`.
4. Smoke test as on staging (health, log in, open a board, reload).

**Rolling back:** redeploy the previous commit in Render and Vercel (both keep earlier deploys). A migration is never rolled back; fix forward.

## Backups
Neon keeps point-in-time history for the production branch (the retention depends on the plan). **Tested restore (once before go-live, then after big schema changes):**
1. Create a branch from a point in time.
2. Point a local API at its connection string, or a spare Render service.
3. Check that the data is there.
4. Delete the branch.

## Go-live checklist
- [ ] All secrets in Render's and Vercel's settings, none in the repo
- [ ] HTTPS on `app.<domain>` and `api.<domain>`; `CLIENT_URL=https://app.<domain>` (CORS); a reload keeps the session (the cookie)
- [ ] Rate limiting on (`TRUST_PROXY=1`): requests from two different networks get separate `RateLimit` counts (as in the [staging checklist](staging.md#checklist)); logs contain no sensitive data
- [ ] Stripe live keys + a verified webhook for `https://api.<domain>/api/v1/billing/webhook`
- [ ] DB backups on and a restore tested at least once (above)
- [ ] Error tracking and 5xx alerting in place (D-23)

## Scaling
- Multiple API instances → enable the Socket.IO Redis adapter + sticky sessions ([realtime.md](../architecture/realtime.md#scaling--redis-adapter-path)). This needs a new ADR. Until then the container's start-up migration relies on one instance.
- Slow DB: inspect slow queries, add indexes, consider a read replica.
