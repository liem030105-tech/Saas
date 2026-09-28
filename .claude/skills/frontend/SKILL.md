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
2. `docs/design/ui.md` – what the screen looks like, its states, and its interactions
3. `docs/api/<module>.md` – the endpoints the feature calls
4. The target feature folder `src/features/<x>/` and its `index.ts`

## Rules
The always-on rules live in [`.claude/rules/frontend.md`](../../rules/frontend.md) and load automatically for matching files; follow them. This skill adds the procedure, references, and checklist.

## References
Read the one that matches the work before writing code; they show the target shape. If the real code differs, the code wins: update the reference in the same PR.
- [`references/tanstack-query.md`](references/tanstack-query.md): key factory, queries, mutations, optimistic update with rollback, component states
- [`references/forms.md`](references/forms.md): React Hook Form + shared Zod schema, mapping server errors to fields
- [`references/auth-client.md`](references/auth-client.md): in-memory access token, single-flight refresh interceptor, session restore, logout
- [`references/dnd-kit-kanban.md`](references/dnd-kit-kanban.md): lists and cards drag and drop, sensors, position calculation, pitfalls
- [`references/ui-conventions.md`](references/ui-conventions.md): tokens, shadcn usage, states, toasts, accessibility, responsive checks

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
