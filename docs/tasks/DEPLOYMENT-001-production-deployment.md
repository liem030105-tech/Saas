# DEPLOYMENT-001: Staging and production deployment

| Field | Value |
|-------|-------|
| Phase | 9 (Post-MVP) |
| Depends on | TESTING-001 |
| Blocked by decisions | none (D-21, D-22 resolved: ADR-023); D-23 has a default |
| Skills | backend, frontend |

# Goal
The app runs on staging (auto-deploy from `main`) and production (release tags) with migrations, monitoring, and backups.

# Context
[deployment/staging.md](../deployment/staging.md), [deployment/production.md](../deployment/production.md), security cookie note D-22.

# Requirements
1. A Dockerfile for the API (Render) and health checks; the FE static build runs on Vercel (ADR-023).
2. Staging: auto-deploy on merge; `prisma migrate deploy` before start; seed data only.
3. Production: deploy on a release tag; the go-live checklist in production.md complete.
4. Domain topology per D-22 so the refresh cookie works: FE and API on one registrable domain (ADR-023).
5. Monitoring per D-23; DB backups with one tested restore.
6. `docs/deployment/*` updated with the real values (no secrets).

# Out of Scope
Multi-instance scaling / the Redis adapter (needs a new ADR).

# Frontend Changes
Build config and env only.

# Backend Changes
Dockerfile, trust-proxy setting, production env validation.

# Database Changes
None (migrations only run).

# API Changes
None.

# Realtime Changes
None (single instance).

# Security Considerations
Secrets in the platform secret manager; HTTPS only; CORS limited to the production origin; cookie behavior verified in a real browser.

# Testing
Smoke test after each deploy (`/health`, login, open a board); optional E2E against staging.

# Acceptance Criteria
- [ ] A user can register, log in, and use boards on production; the session survives a reload (the refresh cookie works across `app.` and `api.`, D-22).

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
TESTING-001; decisions D-21, D-22.

# Risks
Cookie/CORS misconfiguration → verified explicitly in the acceptance test.
