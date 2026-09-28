## Task
<!-- Task ID from docs/tasks (e.g. AUTH-001), or "none" for docs/tooling changes -->

## What changed
<!-- By area: BE / shared / FE / DB / docs / tooling -->

## Why

## How it was tested
<!-- Commands run and their results; for UI changes, what you checked in the browser -->

## Definition of Done
<!-- docs/development/definition-of-done.md; mark n/a where it does not apply -->
- [ ] Architecture boundaries respected (FE / BE / shared, no cross-module internals)
- [ ] Backend authorization per the permission matrix (403 case tested)
- [ ] Tenant isolation: non-members get 404; client-supplied ids resolved in the same workspace
- [ ] All input validated with Zod; errors in the canonical format
- [ ] Tests per the test requirements matrix
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes with no new warnings
- [ ] Docs updated (API, schema, architecture, setup) and task status set in docs/tasks/README.md
- [ ] No secrets in code, fixtures, logs, or the FE bundle
- [ ] No unrelated changes; new dependencies justified above
- [ ] Schema changes come with a new migration; merged migrations untouched
- [ ] CI green
