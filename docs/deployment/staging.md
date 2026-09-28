# Staging

> **Domain:** the staging environment. Finalized in Phase 9.

Platforms are pending **D-21**; FE and API must be same-site for the refresh cookie (**D-22**).

| Component | Platform | Notes |
|-----------|----------|-------|
| FE | Vercel (preview deployment per PR) | `VITE_API_URL` points to the staging API |
| BE | Render / Railway (1 instance) | Auto-deploys on merge to `main` |
| DB | Neon / Supabase (separate branch or project) | Seed data only, **never** real data |
| Stripe | Test mode | Separate webhook endpoint |

## Process
1. Merge to `main` with green CI.
2. BE build → `prisma migrate deploy` → start.
3. Smoke test: `GET /health`, log in with the seed account.
4. Optionally run E2E against staging.

## Checklist
- [ ] Staging secrets are separate from production
- [ ] `CLIENT_URL` matches the staging domain (CORS)
- [ ] `Secure` cookies work (HTTPS)
