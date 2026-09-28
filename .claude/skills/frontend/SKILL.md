---
name: frontend
description: Use when creating or modifying frontend code in Trello-Clone-FE/src – React components, pages, routes, feature modules, TanStack Query hooks, Zustand stores, forms, drag and drop, or styling with Tailwind/shadcn/ui.
---

# Skill: Frontend (Trello-Clone-FE)

## Purpose
Keep FE code feature-based, keep server state in TanStack Query, and keep the UI consistent with the API contract.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/architecture/frontend.md` – folder responsibilities, state rules
2. `docs/api/<module>.md` – the endpoints the feature calls
3. The target feature folder `src/features/<x>/` and its `index.ts`

## Rules
The always-on rules live in [`.claude/rules/frontend.md`](../../rules/frontend.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

## May modify
- `Trello-Clone-FE/**` (except `.env`)
- `packages/shared/**` only when a schema is genuinely missing (coordinate with the BE; prefer the `backend` skill to drive contract changes)

## Must never modify
- `Trello-Clone-BE/**`
- `.env*` except `.env.example`
- Put secrets or non-`VITE_` config into the FE bundle

## Done checklist
- [ ] Components/hooks with logic have tests (Vitest + Testing Library + MSW)
- [ ] No server data in Zustand; query keys come from a factory
- [ ] Loading/empty/error states handled
- [ ] `pnpm --filter @trello-clone/web typecheck`, `lint`, `test` pass
