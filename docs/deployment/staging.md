# Staging

> **Domain:** the staging environment (DEPLOYMENT-001). Hosting and domains: [ADR-023](../decisions/README.md#adr-023-hosting-on-vercel-render-and-neon-one-domain-for-fe-and-api-d-21-d-22) (D-21, D-22).

| Component | Platform | Address | Deploys |
|-----------|----------|---------|---------|
| FE | Vercel, project `trello-web-staging` | `https://staging.<domain>` | every push to `main` |
| API + Socket.IO | Render, service `trello-api-staging` (`render.yaml`) | `https://api.staging.<domain>` | every push to `main` |
| DB | Neon, branch `staging` | – | migrations at each API start |
| Files | AWS S3 (ADR-020), a staging bucket | – | – |
| Stripe | test mode, its own webhook endpoint | `https://api.staging.<domain>/api/v1/billing/webhook` | – |

`<domain>` is the domain the owner controls. FE and API must stay on it: the providers' own domains (`*.vercel.app`, `*.onrender.com`) are different sites, and the `SameSite=Strict` refresh cookie would not be sent (D-22).

## One-time setup (repository owner)
1. **Neon:** create a project and a `staging` branch; copy its connection string (pooled is fine).
2. **Render:** New → Blueprint → this repository. Render reads `render.yaml` and creates `trello-api-staging` and `trello-api-production`. For staging, fill in the variables marked `sync: false`:
   - `CLIENT_URL=https://staging.<domain>`;
   - `DATABASE_URL` (Neon staging);
   - `SEED_DEMO_PASSWORD`;
   - S3 and Stripe test-mode values ([setup.md](../development/setup.md#environment-variables)).

   `JWT_ACCESS_SECRET` is generated, `TRUST_PROXY=1` is set. Add the custom domain `api.staging.<domain>` and its DNS record.
3. **Vercel:** New Project → this repository, Root Directory `Trello-Clone-FE`, framework Vite. The install command is left to Vercel, which detects pnpm. Production Branch `main`. Environment variables:
   - `VITE_API_URL=https://api.staging.<domain>/api/v1`;
   - `VITE_SOCKET_URL=https://api.staging.<domain>`.

   Add the domain `staging.<domain>`. `Trello-Clone-FE/vercel.json` sends every path to the SPA.
4. **Seed once:** in the Render shell of `trello-api-staging`, run `./node_modules/.bin/prisma db seed` (demo data, never real data).
5. **Stripe (test mode):** add a webhook endpoint for the address above with the events in [api/billing.md](../api/billing.md#post-billingwebhook), and put its signing secret in `STRIPE_WEBHOOK_SECRET`.

## Each deploy
1. Merge to `main` with green CI (`ci`, `e2e`, `docker`, `docs`).
2. Render builds `Trello-Clone-BE/Dockerfile`. The container applies the migrations (`prisma migrate deploy`), then starts. Render switches traffic once `/api/v1/health` answers.
3. Vercel builds the FE.
4. **Smoke test:**
   - `GET https://api.staging.<domain>/api/v1/health` returns `{ "status": "ok", "db": "ok" }`;
   - log in with the seed account and open a board;
   - reload: you stay signed in (the refresh cookie works);
   - optionally, run the E2E suite against staging.

## Checklist
- [ ] Staging secrets are separate from production
- [ ] `CLIENT_URL` is exactly `https://staging.<domain>` (CORS; the API refuses a non-https origin in production mode)
- [ ] After a reload you are still signed in (`Secure` + `SameSite=Strict` cookie over HTTPS)
