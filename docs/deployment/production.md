# Production

> **Domain:** the production environment. Finalized in Phase 9.

## Infrastructure
Platforms are pending **D-21** (hosting) and **D-23** (monitoring); the cookie/domain topology is **D-22**.

| Component | Suggested platform |
|-----------|--------------------|
| FE | Vercel / Netlify (static + CDN) |
| BE + Socket.IO | Render / Railway / Fly.io |
| DB | Neon / Supabase PostgreSQL (automated backups) |
| Files | Cloudinary / AWS S3 |
| Error tracking | Sentry (FE + BE) |

## Deployment
1. Tag/release from `main` with green CI.
2. `prisma migrate deploy` (migrations must be backward compatible; see [architecture/database.md](../architecture/database.md#migrations)).
3. Deploy BE → health check → shift traffic.
4. Deploy FE.

## Go-live checklist
- [ ] All secrets in the platform's secret manager, none in the repo
- [ ] HTTPS, `Secure` cookies, CORS limited to the production domain
- [ ] Rate limiting on; logs contain no sensitive data
- [ ] Stripe live keys + verified webhook
- [ ] DB backups enabled and a restore tested at least once
- [ ] Sentry and 5xx alerting in place

## Scaling
- Multiple BE instances → enable the Socket.IO Redis adapter + sticky sessions ([realtime.md](../architecture/realtime.md#scaling--redis-adapter-path)).
- Slow DB: inspect slow queries, add indexes, consider a read replica.
